# MMO Asteroids

Pure JavaScript Multiplayer Asteroids. Powered by [Firebase](https://firebase.com).

[![Preview](preview.gif)](https://mmoasteroids.firebaseapp.com/)
[Live Demo](https://mmoasteroids.firebaseapp.com/)

Based on the [original version](https://github.com/dmcinnes/HTML5-Asteroids) by 
[Doug McInnes](https://github.com/dmcinnes), we added some Firebase love and made it multiplayer! 
And, along the way... we removed the asteroids. They cluttered the MMO carnage.

## The Client
The game lives in [`/app`](app). This is the part you'd deploy to a web server so people can play 
the game.

## The Bot
There's a bot too! It lives in [`/bot`](bot). It runs in Node.js and it copies a lot of the game 
code from the client game. It spawns some bot players for you to play against.

## License

MIT License, see [LICENSE](LICENSE)