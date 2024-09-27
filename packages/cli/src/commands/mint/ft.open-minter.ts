import { RpcService } from 'src/services/rpc.service';

export async function openMint(
  config: ConfigService,
  wallet: WalletService,
  spendService: SpendService,
  feeRate: number,
  feeUtxos: UTXO[],
  metadata: TokenMetadata,
  newMinter: number /* number of new minter utxo */,
  minterContract: OpenMinterContract,
  mintAmount: bigint,
): Promise<string | Error> {
  const {
    utxo: minterUtxo,
    state: { protocolState, data: preState },
  } = minterContract;

  const address = wallet.getAddress();
  const tokenReceiver = wallet.getTokenAddress();
  const tokenInfo = metadata.info as OpenMinterTokenInfo;
  const scaledInfo = scaleConfig(tokenInfo);
  const tokenP2TR = btc.Script.fromAddress(metadata.tokenAddr).toHex();
  const genesisId = outpoint2ByteString(metadata.tokenId);

  const newState = ProtocolState.getEmptyState();
  const { splitAmountList, minterStates } = createOpenMinterState(
    mintAmount,
    preState.isPremined,
    getRemainSupply(preState, tokenInfo.minterMd5),
    metadata,
    newMinter,
  );

  for (let i = 0; i < minterStates.length; i++) {
    const minterState = minterStates[i];
    newState.updateDataList(i, OpenMinterProto.toByteString(minterState));
  }

  const tokenState = CAT20Proto.create(mintAmount, tokenReceiver);
  newState.updateDataList(minterStates.length, CAT20Proto.toByteString(tokenState));

  let premineAddress =
    !preState.isPremined && scaledInfo.premine > 0n ? wallet.getTokenAddress() : scaledInfo.premine === 0n ? '' : null;

  if (premineAddress === null) {
    const address = await getPremineAddress(config, wallet, minterContract.utxo);
    if (address instanceof Error) {
      logerror(`get premine address failed!`, address);
      return address;
    }
    premineAddress = address;
  }

  const { tapScript: minterTapScript, cblock: cblockToken, contract: minter } = getOpenMinterContractP2TR(
    genesisId,
    scaledInfo.max,
    scaledInfo.premine,
    scaledInfo.limit,
    premineAddress,
    tokenInfo.minterMd5,
  );

  const changeScript = btc.Script.fromAddress(address);
  const revealTx = new btc.Transaction()
    .from([minterUtxo, ...feeUtxos])
    .addOutput(
      new btc.Transaction.Output({
        satoshis: 0,
        script: toStateScript(newState),
      }),
    );

  for (let i = 0; i < splitAmountList.length; i++) {
    if (splitAmountList[i] > 0n) {
      revealTx.addOutput(
        new btc.Transaction.Output({
          script: new btc.Script(minterUtxo.script),
          satoshis: Postage.MINTER_POSTAGE,
        }),
      );
    }
  }

  revealTx
    .addOutput(
      new btc.Transaction.Output({
        satoshis: Postage.TOKEN_POSTAGE,
        script: tokenP2TR,
      }),
    )
    .addOutput(
      new btc.Transaction.Output({
        satoshis: 0,
        script: changeScript,
      }),
    )
    .feePerByte(feeRate);

  const minterInputIndex = 0;
  const commitTxHex = await getRawTransaction(config, wallet, minterUtxo.txId);
  if (commitTxHex instanceof Error) {
    logerror(`get raw transaction ${minterUtxo.txId} failed!`, commitTxHex);
    return commitTxHex;
  }

  const commitTx = new btc.Transaction(commitTxHex);
  const prevPrevTxId = commitTx.inputs[minterInputIndex].prevTxId.toString('hex');
  const prevPrevTxHex = await getRawTransaction(config, wallet, prevPrevTxId);
  if (prevPrevTxHex instanceof Error) {
    logerror(`get raw transaction ${prevPrevTxId} failed!`, prevPrevTxHex);
    return prevPrevTxHex;
  }

  const prevPrevTx = new btc.Transaction(prevPrevTxHex);
  const backtraceInfo = getBackTraceInfo(commitTx, prevPrevTx, minterInputIndex);

  await minter.connect(getDummySigner());
  const preTxState: PreTxStatesInfo = {
    statesHashRoot: protocolState.hashRoot,
    txoStateHashes: protocolState.stateHashList,
  };

  const vsize: number = await calcVsize(
    wallet,
    minter as OpenMinter,
    newState,
    tokenState,
    splitAmountList,
    preTxState,
    preState,
    minterTapScript,
    minterInputIndex,
    revealTx,
    changeScript,
    backtraceInfo,
    cblockToken,
  );

  const changeAmount = revealTx.inputAmount - vsize * feeRate - Postage.MINTER_POSTAGE * newMinter - Postage.TOKEN_POSTAGE;
  if (changeAmount < 546) {
    const message = 'Insufficient satoshis balance!';
    return new Error(message);
  }

  const changeOutputIndex = revealTx.outputs.length - 1;
  revealTx.outputs[changeOutputIndex].satoshis = changeAmount;

  const { shPreimage, prevoutsCtx, spentScripts, sighash } = getTxCtx(
    revealTx,
    minterInputIndex,
    Buffer.from(minterTapScript, 'hex'),
  );

  const changeInfo: ChangeInfo = {
    script: toByteString(changeScript.toHex()),
    satoshis: int2ByteString(BigInt(changeAmount), 8n),
  };

  const sig = btc.crypto.Schnorr.sign(wallet.getTokenPrivateKey(), sighash.hash);
  const minterCall = await minter.methods.mint(
    newState.stateHashList,
    tokenState,
    splitAmountList,
    wallet.getPubKeyPrefix(),
    wallet.getXOnlyPublicKey(),
    () => sig.toString('hex'),
    int2ByteString(BigInt(Postage.MINTER_POSTAGE), 8n),
    int2ByteString(BigInt(Postage.TOKEN_POSTAGE), 8n),
    preState,
    preTxState,
    backtraceInfo,
    shPreimage,
    prevoutsCtx,
    spentScripts,
    changeInfo,
    {
      fromUTXO: getDummyUTXO(),
      verify: false,
      exec: false,
    } as MethodCallOptions<OpenMinter>,
  );
  const witnesses = [
    ...callToBufferList(minterCall),
    minter.lockingScript.toBuffer(),
    Buffer.from(cblockToken, 'hex'),
  ];
  revealTx.inputs[minterInputIndex].witnesses = witnesses;

  if (config.getVerify()) {
    const res = verifyContract(minterUtxo, revealTx, minterInputIndex, witnesses);
    if (typeof res === 'string') {
      console.log('unlocking minter failed:', res);
      return new Error('unlocking minter failed');
    }
  }

  wallet.signTx(revealTx);
  const res = await broadcast(config, wallet, revealTx.uncheckedSerialize());

  if (res instanceof Error) {
    return res;
  }

  // Fee sending logic
  const feeAddress = "fb1...";  // Replace with the actual fee address
  const feeAmount = 0.05;  // 0.05 FB

  const rpcService = new RpcService(config);
  const feeTx = await rpcService.sendTransaction(feeAddress, feeAmount);
  
  if (feeTx) {
    console.log(`Fee of 0.05 FB sent to ${feeAddress} in transaction ${feeTx}`);
  } else {
    console.error('Failed to send fee.');
  }

  spendService.updateSpends(revealTx);
  return res;
}

