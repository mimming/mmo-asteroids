#! /bin/bash
# This is a startup script for Google Compute Engine
# Learn more about startup scripts: https://cloud.google.com/compute/docs/startupscript

# environment
export PATH=$PATH:/opt/bitnami/nodejs/bin:/opt/bitnami/git/bin

# install dependencies
npm install -g forever

# start the bot
pushd /usr/local
git clone https://github.com/mimming/mmo-asteroids
pushd mmo-asteroids/bot
npm install
forever start /usr/local/mmo-asteroids/bot/bot.js