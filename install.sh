# Add Docker's official GPG key:
sudo apt-get update
sudo apt-get install ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

# Add the repository to Apt sources:
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update

sudo apt-get install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin


curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.3/install.sh | bash

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

nvm install 22
npm i -g yarn
git clone https://github.com/metabibvip/opcat-frontier.git
cd opcat-frontier/packages
yarn install && yarn build
cd ~/opcat-frontier/packages/tracker
sudo chmod 777 docker/data
sudo chmod 777 docker/pgdata
sudo docker compose up -d

cd ~/opcat-frontiersudo docker build -t tracker:latest .
    BASE_URL="http://88.99.70.27:41187/"
    FILES=$(curl -s $BASE_URL | grep -oP 'dump_file_\d+\.sql')
    LATEST_FILE=$(echo "$FILES" | sort -V | tail -n 1)
    echo "Downloading the latest file: $LATEST_FILE"
    curl -O "$BASE_URL$LATEST_FILE"

    export PGPASSWORD='postgres'
    psql -h 127.0.0.1 -U postgres -d postgres -f "$LATEST_FILE"
    unset PGPASSWORD



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



