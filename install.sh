
sudo apt update
sudo apt install git -y

sudo apt-get install ca-certificates curl -y
sudo install -m 0755 -d /etc/apt/keyrings -y
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update

curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.3/install.sh | bash
nvm install 22
npm i -g yarn
git clone https://github.com/metabibvip/opcat-frontier.git
cd opcat-frontier/packages/tracker
yarn install && yarn build
cd ~/opcat-frontier/packages/cli
yarn install && yarn build
cd ~/opcat-frontier/packages/tracker
sudo chmod 777 docker/data
sudo chmod 777 docker/pgdata
sudo docker compose up -d
cd ~/opcat-frontier
sudo docker run -d \
    --name tracker \
    --add-host="host.docker.internal:host-gateway" \
    -e DATABASE_HOST="host.docker.internal" \
    -e RPC_HOST="host.docker.internal" \
    -p 3000:3000 \
    tracker:latest
yarn cli wallet create
yarn cli wallet address
sudo chmod +x ./mint.sh



