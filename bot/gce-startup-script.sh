#! /bin/bash
# This is a startup script for Google Compute Engine
# Learn more about startup scripts: https://cloud.google.com/compute/docs/startupscript

pushd /usr/local
git clone https://github.com/mimming/mmo-asteroids
pushd /usr/local/mmo-asteroids/bot
/opt/bitnami/nodejs/bin/node ./bot.js&

