/*
 Copyright (c) 2010 Doug McInnes

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
 */

console.log("Hello! I'm the asteroids bot. I'm going to spawn someone for you to play against.");

var Firebase = require("firebase");
// Constants

// Gameplay constants
var SHIP_MAX_SPEED = 8;
var SHIP_ROTATION_RATE = 5;

var BULLET_DELAY = 10;
var BULLET_MAX_COUNT = 10;
var BULLET_LIFETIME = 50;

// Game field constants
var CANVAS_WIDTH = 1000;
var CANVAS_HEIGHT = 700;

// bot types: derpy, hunter
var botType = "derpy";

/**
 * The grid sized, used to speed up collision maths.
 * Too small = missed collisions
 * Too big = too slow
 */
var GRID_SIZE = 60;


// The ship this bot is targeting
var targetShip;

// Firebase connection stuff
var firebaseRef = new Firebase("https://mmoasteroids.firebaseio.com");
var firebaseRefGame = firebaseRef.child('game');

var currentUser = {
  imageUrl: "https://mmoasteroids.firebaseapp.com/assets/robot.png",
  name: "Bot " + Math.floor(10000 * Math.random()),
};

// User login
firebaseRef.onAuth(function (authData) {
  if (authData) {
    // Create a new bot user
    currentUser.uid = authData.uid;
    currentUser.provider = authData.provider;
        
  } else {
    // If they're not authenticated, auth them anonymously
    firebaseRef.authAnonymously(function (error, authData) {
      if (error) {
        console.log("Anonymous login Failed!", error);
      }
    });
  }
});

// Add player's ship to Firebase
var myship = firebaseRefGame.child('players').push();

// Schedule player removal on disconnect
myship.onDisconnect().remove();

// Used to do collision detection
Matrix = function (rows, columns) {
  var i, j;
  this.data = new Array(rows);
  for (i = 0; i < rows; i++) {
    this.data[i] = new Array(columns);
  }

  this.configure = function (rot, scale, transx, transy) {
    var rad = (rot * Math.PI) / 180;
    var sin = Math.sin(rad) * scale;
    var cos = Math.cos(rad) * scale;
    this.set(cos, -sin, transx,
        sin, cos, transy);
  };

  this.set = function () {
    var k = 0;
    for (i = 0; i < rows; i++) {
      for (j = 0; j < columns; j++) {
        this.data[i][j] = arguments[k];
        k++;
      }
    }
  };

  this.multiply = function () {
    var vector = new Array(rows);
    for (i = 0; i < rows; i++) {
      vector[i] = 0;
      for (j = 0; j < columns; j++) {
        vector[i] += this.data[i][j] * arguments[j];
      }
    }
    return vector;
  };
};

// The game pieces (sprites)

/**
 * Sprite: ships, bullets, and all other things inherit behavior from here
 */
Sprite = function () {
  this.init = function (name, points) {
    this.name = name;
    this.points = points;

    this.vel = {
      x: 0,
      y: 0,
      rot: 0
    };

    this.acc = {
      x: 0,
      y: 0,
      rot: 0
    };
  };

  this.children = {};

  this.visible = false;
  this.reap = false;
  this.bridgesH = true;
  this.bridgesV = true;

  this.collidesWith = [];

  this.x = 0;
  this.y = 0;
  this.rot = 0;
  this.scale = 1;

  this.currentNode = null;
  this.nextSprite = null;

  this.strokeStyle = "#000000";

  this.run = function (delta) {

    this.move(delta);
    this.updateGrid();


    var canidates = this.findCollisionCanidates();

    this.matrix.configure(this.rot, this.scale, this.x, this.y);
    this.checkCollisionsAgainst(canidates);

    if (this.bridgesH && this.currentNode && this.currentNode.dupe.horizontal) {
      this.x += this.currentNode.dupe.horizontal;
      this.checkCollisionsAgainst(canidates);
      if (this.currentNode) {
        this.x -= this.currentNode.dupe.horizontal;
      }
    }
    if (this.bridgesV && this.currentNode && this.currentNode.dupe.vertical) {
      this.y += this.currentNode.dupe.vertical;
      this.checkCollisionsAgainst(canidates);
      if (this.currentNode) {
        this.y -= this.currentNode.dupe.vertical;
      }
    }
    if (this.bridgesH && this.bridgesV &&
        this.currentNode &&
        this.currentNode.dupe.vertical &&
        this.currentNode.dupe.horizontal) {
      this.x += this.currentNode.dupe.horizontal;
      this.y += this.currentNode.dupe.vertical;
      this.checkCollisionsAgainst(canidates);
      if (this.currentNode) {
        this.x -= this.currentNode.dupe.horizontal;
        this.y -= this.currentNode.dupe.vertical;
      }
    }
  };
  this.move = function (delta) {
    if (!this.visible) return;
    this.transPoints = null; // clear cached points

    this.preMove(delta);

    this.vel.x += this.acc.x * delta;
    this.vel.y += this.acc.y * delta;
    this.x += this.vel.x * delta;
    this.y += this.vel.y * delta;
    this.rot += this.vel.rot * delta;
    if (this.rot > 360) {
      this.rot -= 360;
    } else if (this.rot < 0) {
      this.rot += 360;
    }

    this.postMove(delta);
  };
  
  this.preMove = function () {
    //noop
  };

  this.postMove = function () {
    //noop
  };

  this.updateGrid = function () {
    if (!this.visible) return;
    var gridx = Math.floor(this.x / GRID_SIZE);
    var gridy = Math.floor(this.y / GRID_SIZE);
    gridx = (gridx >= this.grid.length) ? 0 : gridx;
    gridy = (gridy >= this.grid[0].length) ? 0 : gridy;
    gridx = (gridx < 0) ? this.grid.length - 1 : gridx;
    gridy = (gridy < 0) ? this.grid[0].length - 1 : gridy;
    var newNode = this.grid[gridx][gridy];
    if (newNode != this.currentNode) {
      if (this.currentNode) {
        this.currentNode.leave(this);
      }
      newNode.enter(this);
      this.currentNode = newNode;
    }

  };

  this.findCollisionCanidates = function () {
    if (!this.visible || !this.currentNode) return [];
    var cn = this.currentNode;
    var canidates = [];
    if (cn.nextSprite) canidates.push(cn.nextSprite);
    if (cn.north.nextSprite) canidates.push(cn.north.nextSprite);
    if (cn.south.nextSprite) canidates.push(cn.south.nextSprite);
    if (cn.east.nextSprite) canidates.push(cn.east.nextSprite);
    if (cn.west.nextSprite) canidates.push(cn.west.nextSprite);
    if (cn.north.east.nextSprite) canidates.push(cn.north.east.nextSprite);
    if (cn.north.west.nextSprite) canidates.push(cn.north.west.nextSprite);
    if (cn.south.east.nextSprite) canidates.push(cn.south.east.nextSprite);
    if (cn.south.west.nextSprite) canidates.push(cn.south.west.nextSprite);
    return canidates
  };
  this.checkCollisionsAgainst = function (candidates) {
    for (var i = 0; i < candidates.length; i++) {
      var ref = candidates[i];
      do {
        this.checkCollision(ref);
        ref = ref.nextSprite;
      } while (ref)
    }
  };
  this.checkCollision = function (other) {
    if (!other.visible ||
        this == other ||
        this.collidesWith.indexOf(other.name) == -1) return;

    var trans = other.transformedPoints();
    var px, py;
    var rawPoly = this.transformedPoints();
    var thisPoly = [];
    
    for(var g = 0; g < rawPoly.length/2; g++) {
      var thisPolyPoint = [];
      thisPolyPoint[0] = rawPoly[g*2];
      thisPolyPoint[1] = rawPoly[g*2+1];

      thisPoly[g] = thisPolyPoint;
    }
    
    for (var g = 0; g < trans.length/2; g++) {
      px = trans[g*2];
      py = trans[g*2 + 1];

      var inside = false;
      for (var i = 0, j = thisPoly.length - 1; i < thisPoly.length; j = i++) {
        var xi = thisPoly[i][0], yi = thisPoly[i][1];
        var xj = thisPoly[j][0], yj = thisPoly[j][1];

        var intersect = ((yi > py) != (yj > py))
            && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }
      
      if(inside) {
        console.log("collision detected");

        other.collision(this);
        this.collision(other);
        return;
      }
    }
  };
  this.collision = function () {
  };
  this.die = function () {
    this.visible = false;
    this.reap = true;
    if (this.currentNode) {
      this.currentNode.leave(this);
      this.currentNode = null;
    }
  };
  
  this.transformedPoints = function () {
    if (this.transPoints) return this.transPoints;
    var trans = new Array(this.points.length);
    this.matrix.configure(this.rot, this.scale, this.x, this.y);
    for (var i = 0; i < this.points.length / 2; i++) {
      var xi = i * 2;
      var yi = xi + 1;
      var pts = this.matrix.multiply(this.points[xi], this.points[yi], 1);
      trans[xi] = pts[0];
      trans[yi] = pts[1];
    }
    this.transPoints = trans; // cache translated points
    return trans;
  };
  
  this.isClear = function () {
    if (this.collidesWith.length == 0) return true;
    var cn = this.currentNode;
    if (cn == null) {
      var gridx = Math.floor(this.x / GRID_SIZE);
      var gridy = Math.floor(this.y / GRID_SIZE);
      gridx = (gridx >= this.grid.length) ? 0 : gridx;
      gridy = (gridy >= this.grid[0].length) ? 0 : gridy;
      cn = this.grid[gridx][gridy];
    }
    return (cn.isEmpty(this.collidesWith) &&
        cn.north.isEmpty(this.collidesWith) &&
        cn.south.isEmpty(this.collidesWith) &&
        cn.east.isEmpty(this.collidesWith) &&
        cn.west.isEmpty(this.collidesWith) &&
        cn.north.east.isEmpty(this.collidesWith) &&
        cn.north.west.isEmpty(this.collidesWith) &&
        cn.south.east.isEmpty(this.collidesWith) &&
        cn.south.west.isEmpty(this.collidesWith));
  };
  this.wrapPostMove = function () {
    if (this.x > Game.canvasWidth) {
      this.x = 0;
    } else if (this.x < 0) {
      this.x = Game.canvasWidth;
    }
    if (this.y > Game.canvasHeight) {
      this.y = 0;
    } else if (this.y < 0) {
      this.y = Game.canvasHeight;
    }
  };
};

/**
 * The player's ship
 */
Ship = function () {
  this.aiTimer = 0;

  this.init("ship",
      [-5, 4,
        0, -12,
        5, 4]);

  this.scale = 1.5;
  this.children.exhaust = new Sprite();
  this.children.exhaust.strokeStyle = "#ff0000";
  this.children.exhaust.init("exhaust",
      [-3, 6,
        0, 11,
        3, 6]);

  
  this.visible = true;
  this.bulletCounter = 0;
  this.strokeStyle = "#ffff00";
  this.keyFrame = 0;

  this.postMove = this.wrapPostMove;

  this.collidesWith = ["enemybullet", "enemyship"];

  this.previousKeyFrame = { vel: { rot: 0 }, accb: false };

  this.nextMove = {
    left: false,
    right: false,
    up: false,
    space: false
  };

  this.preMove = function (delta) {
    // AI decides what to do

    if(botType == "hunter") {
      // Find a target
      // TODO: target random ship? This one targets the oldest one
      if(Game != null && targetShip == null || targetShip.visible == false) {
        console.log("I have no target. Time to go find one " + Game.sprites.keys());
        // Pick a new target
        for(var shipKey in Game.sprites) {
          console.log("considering " + Game.sprites[shipKey].name);
          if(Game.sprites[shipKey].name == "enemyship") {
            console.log("Targeting enemy: " + Game.sprites[shipKey]);
            targetShip = Game.sprites[shipKey];
          }
        }
      }
    } else if(botType == "derpy") {
      // If it's been a second since last decision
      if(Date.now() - this.aiTimer > 1200) {
        this.aiTimer = Date.now();
        var decision = Math.round(Math.random() * 4);
        switch(decision) {
          case 0:
            console.log("turn right");
            nextMove = {
              left: false,
              right: true,
              up: false,
              space: false
            };
            break;
          case 1:
            console.log("turn left, shoot");
            nextMove = {
              left: true,
              right: false,
              up: false,
              space: true
            };
            break;
          case 2:
            console.log("turn right, shoot, engine");
            nextMove = {
              left: false,
              right: true,
              up: true,
              space: true
            };
          case 3:
            console.log("shoot stuff");
            nextMove = {
              left: false,
              right: false,
              up: false,
              space: true
            };
            break;
          case 4:
            console.log("enable engine");
            nextMove = {
              left: false,
              right: false,
              up: true,
              space: false
            };
            break;
          default:
            // do nothing
            nextMove = {
              left: false,
              right: false,
              up: false,
              space: false
            };
        }
      }
    }

    if (nextMove.left) {
      this.vel.rot = -SHIP_ROTATION_RATE;
    } else if (nextMove.right) {
      this.vel.rot = SHIP_ROTATION_RATE;
    } else {
      this.vel.rot = 0;
    }

    if (nextMove.up) {
      var keyUpRad = ((this.rot - 90) * Math.PI) / 180;
      this.acc.x = 0.5 * Math.cos(keyUpRad);
      this.acc.y = 0.5 * Math.sin(keyUpRad);
      this.children.exhaust.visible = Math.random() > 0.1;
    } else {
      this.acc.x = 0;
      this.acc.y = 0;
      this.children.exhaust.visible = false;
    }

    if (this.bulletCounter > 0) {
      this.bulletCounter -= delta;
    }

    if (nextMove.space) {
      if (this.bulletCounter <= 0) {
        this.bulletCounter = BULLET_DELAY;
        for (var i = 0; i < this.bullets.length; i++) {
          if (!this.bullets[i].visible) {
            var bullet = this.bullets[i];
            var rad = ((this.rot - 90) * Math.PI) / 180;
            var vectorx = Math.cos(rad);
            var vectory = Math.sin(rad);
            // move to the nose of the ship
            bullet.x = this.x + vectorx * 4;
            bullet.y = this.y + vectory * 4;
            bullet.vel.x = 6 * vectorx + this.vel.x;
            bullet.vel.y = 6 * vectory + this.vel.y;
            bullet.visible = true;
            bullet.fref = firebaseRefGame.child('bullets').push({
              s: myship.key(),
              x: bullet.x,
              y: bullet.y,
              vel: bullet.vel
            });
            bullet.fref.onDisconnect().remove();
            break;
          }
        }
      }
    }

    // limit the ship's speed
    if (Math.sqrt(this.vel.x * this.vel.x + this.vel.y * this.vel.y) > SHIP_MAX_SPEED) {
      this.vel.x *= 0.95;
      this.vel.y *= 0.95;
    }

    // Write new ship location to Firebase on each key frame
    if ((this.vel.rot !== this.previousKeyFrame.vel.rot) || (nextMove.up !== this.previousKeyFrame.accb)) {
      myship.set({
        ship: {
          acc: this.acc,
          vel: this.vel,
          x: this.x,
          y: this.y,
          rot: this.rot,
          accb: nextMove.up
        },
        user: currentUser
      });
    }
    this.previousKeyFrame = { vel: { rot: this.vel.rot }, accb: nextMove.up };

    // Write new ship location to Firebase about every 60 frames
    this.keyFrame++;
    if (this.keyFrame % 30 == 0) {
      myship.set({
        ship: {
          acc: this.acc,
          vel: this.vel,
          x: this.x,
          y: this.y,
          rot: this.rot,
          accb: nextMove.up
        },
        user: currentUser
      });
    }
  };

  this.collision = function (other) {
    if (other != null) {
      Game.explosionAt(other.x, other.y);
    }
    else {
      Game.explosionAt(Game.ship.x, Game.ship.y);
    }
    Game.FSM.state = 'player_died';
    console.log("Bot died :(");

    this.visible = false;
    if (this.currentNode != null) {
      this.currentNode.leave(this);
    }
    this.currentNode = null;
  };
};

Ship.prototype = new Sprite();

/**
 * Everyone elses' ship (because everyone else is... the enemy!)
 */
EnemyShip = function () {
  this.init("enemyship",
      [-5, 4,
        0, -12,
        5, 4]);

  this.children.exhaust = new Sprite();
  this.children.exhaust.strokeStyle = "#ff0000";
  this.children.exhaust.init("exhaust",
      [-3, 6,
        0, 11,
        3, 6]);

  this.scale = 1.5;
  this.bulletCounter = 0;
  this.strokeStyle = "#ffffff";

  this.postMove = this.wrapPostMove;
  this.collidesWith = ["bullet"];

  this.preMove = function (delta) {
    // limit the ship's speed
    if (Math.sqrt(this.vel.x * this.vel.x + this.vel.y * this.vel.y) > SHIP_MAX_SPEED) {
      this.vel.x *= 0.95;
      this.vel.y *= 0.95;
    }

    if (this.accb) {
      var rad = ((this.rot - 90) * Math.PI) / 180;
      this.acc.x = 0.5 * Math.cos(rad);
      this.acc.y = 0.5 * Math.sin(rad);
      this.children.exhaust.visible = Math.random() > 0.1;
    }
    else {
      this.acc.x = 0;
      this.acc.y = 0;
      this.children.exhaust.visible = false;
    }
  };

  this.collision = function (other) {
    Game.explosionAt(other.x, other.y);
    this.fref.remove();
    this.visible = false;
    this.currentNode.leave(this);
    this.currentNode = null;
  };

};
EnemyShip.prototype = new Sprite();

/**
 * Player's bullet
 */
Bullet = function () {
  this.init("bullet", [0, 0]);
  this.time = 0;
  this.bridgesH = false;
  this.bridgesV = false;
  this.postMove = this.wrapPostMove;

  this.configureTransform = function () {
  };

  this.preMove = function (delta) {
    if (this.visible) {
      this.time += delta;
    }
    if (this.time > BULLET_LIFETIME) {
      this.visible = false;
      this.time = 0;
      this.fref.remove();
    }
  };
  this.collision = function (other) {
    this.time = 0;
    this.visible = false;
    this.fref.remove();
    this.currentNode.leave(this);
    this.currentNode = null;
  };
  this.transformedPoints = function (other) {
    return [this.x, this.y];
  };

};
Bullet.prototype = new Sprite();

EnemyBullet = function () {
  this.init("enemybullet", [0, 0]);
  this.time = 0;
  this.bridgesH = false;
  this.bridgesV = false;
  this.postMove = this.wrapPostMove;

  this.configureTransform = function () {
  };

  this.preMove = function (delta) {
    if (this.visible) {
      this.time += delta;
    }
    if (this.time > 50) {
      this.visible = false;
      this.time = 0;
      this.fref.remove();
    }
  };
  this.collision = function (other) {
    this.time = 0;
    this.visible = false;
    this.currentNode.leave(this);
    this.currentNode = null;
  };
  this.transformedPoints = function (other) {
    return [this.x, this.y];
  };

};
EnemyBullet.prototype = new Sprite();

Explosion = function () {
  this.init("explosion");

  this.bridgesH = false;
  this.bridgesV = false;

  this.lines = [];
  for (var i = 0; i < 5; i++) {
    var rad = 2 * Math.PI * Math.random();
    var x = Math.cos(rad);
    var y = Math.sin(rad);
    this.lines.push([x, y, x * 2, y * 2]);
  }

  this.preMove = function (delta) {
    if (this.visible) {
      this.scale += delta;
    }
    if (this.scale > 8) {
      this.die();
    }
  };
};
Explosion.prototype = new Sprite();

/**
 * Used when display grid is enabled with 'g' key
 */
GridNode = function () {
  this.north = null;
  this.south = null;
  this.east  = null;
  this.west  = null;

  this.nextSprite = null;

  this.dupe = {
    horizontal: null,
    vertical:   null
  };

  this.enter = function (sprite) {
    sprite.nextSprite = this.nextSprite;
    this.nextSprite = sprite;
  };

  this.leave = function (sprite) {
    var ref = this;
    while (ref && (ref.nextSprite != sprite)) {
      ref = ref.nextSprite;
    }
    if (ref) {
      ref.nextSprite = sprite.nextSprite;
      sprite.nextSprite = null;
    }
  };

  this.eachSprite = function(sprite, callback) {
    var ref = this;
    while (ref.nextSprite) {
      ref = ref.nextSprite;
      callback.call(sprite, ref);
    }
  };

  this.isEmpty = function (collidables) {
    var empty = true;
    var ref = this;
    while (ref.nextSprite) {
      ref = ref.nextSprite;
      empty = !ref.visible || collidables.indexOf(ref.name) == -1;
      if (!empty) break;
    }
    return empty;
  };
};


/**
 * The game mechanics and main loop
 */
Game = {
  canvasWidth: CANVAS_WIDTH,
  canvasHeight: CANVAS_HEIGHT,

  sprites: [],
  ship: null,

  explosionAt: function (x, y) {
    var splosion = new Explosion();
    splosion.x = x;
    splosion.y = y;
    splosion.visible = true;
    Game.sprites.push(splosion);
  },

  // Finite state machine of game progression
  FSM: {
    boot: function () {
      this.state = 'start';
    },
    start: function () {
      for (sprite in Game.sprites) {
        if (Game.sprites[sprite].name == 'asteroid') {
          Game.sprites[sprite].die();
        } else if (Game.sprites[sprite].name == 'bullet') {
          Game.sprites[sprite].visible = false;
        }
      }

      this.state = 'spawn_ship';
    },
    spawn_ship: function () {
      console.log("Spawning a new ship");
      Game.ship.x = Math.floor(Game.canvasWidth * Math.random());
      Game.ship.y = Math.floor(Game.canvasHeight * Math.random());
      if (Game.ship.isClear()) {
        Game.ship.rot = 0;
        Game.ship.vel.x = 0;
        Game.ship.vel.y = 0;
        Game.ship.visible = true;
        this.state = 'run';
      }
    },
    run: function () {
    },
    player_died: function () {

      if (this.timer == null) {
        this.timer = Date.now();
      }
      // wait a second before spawning
      if (Date.now() - this.timer > 1000) {
        this.timer = null;
        this.state = 'spawn_ship';
      }

    },
    execute: function () {
      this[this.state]();
    },
    state: 'boot'
  }

};


Game.canvasWidth = CANVAS_WIDTH;
Game.canvasHeight = CANVAS_HEIGHT;

var gridWidth = Math.round(Game.canvasWidth / GRID_SIZE);
var gridHeight = Math.round(Game.canvasHeight / GRID_SIZE);
var grid = new Array(gridWidth);
for (var i = 0; i < gridWidth; i++) {
  grid[i] = new Array(gridHeight);
  for (var j = 0; j < gridHeight; j++) {
    grid[i][j] = new GridNode();
  }
}

// set up the positional references
for (var i = 0; i < gridWidth; i++) {
  for (var j = 0; j < gridHeight; j++) {
    var node = grid[i][j];
    node.north = grid[i][(j == 0) ? gridHeight - 1 : j - 1];
    node.south = grid[i][(j == gridHeight - 1) ? 0 : j + 1];
    node.west = grid[(i == 0) ? gridWidth - 1 : i - 1][j];
    node.east = grid[(i == gridWidth - 1) ? 0 : i + 1][j];
  }
}

// set up borders
for (var i = 0; i < gridWidth; i++) {
  grid[i][0].dupe.vertical = Game.canvasHeight;
  grid[i][gridHeight - 1].dupe.vertical = -Game.canvasHeight;
}

for (var j = 0; j < gridHeight; j++) {
  grid[0][j].dupe.horizontal = Game.canvasWidth;
  grid[gridWidth - 1][j].dupe.horizontal = -Game.canvasWidth;
}

var sprites = [];
Game.sprites = sprites;

// so all the sprites can use it
//  Sprite.prototype.context = context;
Sprite.prototype.grid = grid;
Sprite.prototype.matrix = new Matrix(2, 3);

var ship = new Ship();

sprites.push(ship);

ship.bullets = [];
for (var i = 0; i < BULLET_MAX_COUNT; i++) {
  var bullet = new Bullet();
  ship.bullets.push(bullet);
  sprites.push(bullet);
}
Game.ship = ship;

var extraLife = new Ship();
extraLife.scale = 0.6;
extraLife.visible = true;
extraLife.preMove = null;
extraLife.children = [];

var avgFramerate = 0;
var frameCount = 0;
var elapsedCounter = 0;

var lastFrame = Date.now();
var thisFrame;
var elapsed;
var delta;


var mainLoop = function () {

  Game.FSM.execute();

  thisFrame = Date.now();
  elapsed = thisFrame - lastFrame;
  lastFrame = thisFrame;
  delta = elapsed / 30;

  var i = 0;
  for (var j in sprites) {
    var sprite = sprites[j];
    if (typeof(sprite) != undefined) {
      sprite.run(delta);
      if (sprite.reap) {
        sprite.reap = false;
        sprites.splice(i, 1);
        i--;
      }
    }
    i++;
  }

  frameCount++;
  elapsedCounter += elapsed;
  if (elapsedCounter > 1000) {
    elapsedCounter -= 1000;
    avgFramerate = frameCount;
    frameCount = 0;
  }

  // process at 60 fps
  setTimeout(mainLoop, 1000 / 60);
};

//Presence
firebaseRef.child('.info/connected').on('value', function (snap) {
  //Start the game on connect
  mainLoop();
});


// Sync enemy ships from Firebase to local game state
firebaseRefGame.child('players').on('child_added', function (snapshot) {
  if (snapshot.key() !== myship.key()) {
    var enemy = new EnemyShip();
    enemy.acc = snapshot.val().ship.acc;
    enemy.vel = snapshot.val().ship.vel;
    enemy.x = snapshot.val().ship.x;
    enemy.y = snapshot.val().ship.y;
    enemy.rot = snapshot.val().ship.rot;
    enemy.accb = snapshot.val().ship.accb;
    enemy.visible = true;
    enemy.user = snapshot.val().user;
    enemy.fref = firebaseRefGame.child('players').child(snapshot.key());
    enemy.eimg = null;
    Game.sprites[snapshot.key()] = enemy;
  }
});

firebaseRefGame.child('players').on('child_changed', function (snapshot) {
  if (snapshot.key() !== myship.key()) {
    var enemy = Game.sprites[snapshot.key()];
    enemy.visible = true;
    enemy.acc = snapshot.val().ship.acc;
    enemy.vel = snapshot.val().ship.vel;
    enemy.x = snapshot.val().ship.x;
    enemy.y = snapshot.val().ship.y;
    enemy.rot = snapshot.val().ship.rot;
    enemy.accb = snapshot.val().ship.accb;
    enemy.user = snapshot.val().user;
    enemy.fref = firebaseRefGame.child('players').child(snapshot.key());
    enemy.eimg = null;
  }
});

firebaseRefGame.child('players').on('child_removed', function (snapshot) {
  if (snapshot.key() !== myship.key()) {
    var enemy = Game.sprites[snapshot.key()];
    enemy.visible = false;
    delete Game.sprites[snapshot.key()];
  }
  else {
    Game.ship.collision(null);
  }
});


// Sync enemy bullets from Firebase to local game state
firebaseRefGame.child('bullets').on('child_added', function (snapshot) {
  var bullet = snapshot.val();
  if (bullet.s !== myship.key()) {
    var enemybullet = new EnemyBullet();
    enemybullet.x = bullet.x;
    enemybullet.y = bullet.y;
    enemybullet.vel = bullet.vel;
    enemybullet.visible = true;
    enemybullet.fref = firebaseRefGame.child('bullets').child(snapshot.key());
    Game.sprites['bullet:' + snapshot.key()] = enemybullet;
  }
});

firebaseRefGame.child('bullets').on('child_removed', function (snapshot) {
  var bullet = snapshot.val();
  if (bullet.s !== myship.key()) {
    var enemybullet = Game.sprites['bullet:' + snapshot.key()];
    if (enemybullet != null) {
      enemybullet.visible = false;
    }
    delete Game.sprites['bullet:' + snapshot.key()];
  }
});