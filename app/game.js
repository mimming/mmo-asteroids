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

//TODO - Anonymous users should have persistent names across visits
//TODO - add touch controls for mobile

// Constants

// Keys
var KEY_CODES = {
  32: 'space',
  37: 'left',
  38: 'up',
  39: 'right',
  40: 'down',
  71: 'g'
};
var BUTTON_CODES = {
  'dpad-left': 'left',
  'dpad-right': 'right',
  'button-go': 'up',
  'button-fire': 'space'
};


// Gameplay constants
var SHIP_MAX_SPEED = 8;
var SHIP_ROTATION_RATE = 5;

var BULLET_DELAY = 10;
var BULLET_MAX_COUNT = 10;
var BULLET_LIFETIME = 50;

var STARTING_LIVES = 4;


// UI constants
var CANVAS_WIDTH = 900;
var CANVAS_HEIGHT = 700;
/**
 * The grid sized, used to speed up collision maths. 
 * Too small = missed collisions
 * Too big = too slow
 */
var GRID_SIZE = 60;
/**
 * How many leaders to display 
 */
var LEADERBOARD_SIZE = 10;

// Firebase connection Stuff
var firebaseRef = new Firebase("https://mmoasteroids.firebaseio.com");
var firebaseRefGame = firebaseRef.child('game');
var firebaseRefLeaderboard = firebaseRef.child('leaderboard');

var currentUser = null;
var currentUserCachedImage = null;

// User login
firebaseRef.onAuth(function(authData) {
  if(authData) {
    // User logged in
    currentUser = {
      uid: authData.uid,
      type: authData.provider,
      name: "Guest " + Math.floor(10000 * Math.random()),
      imageUrl: null
    };
    if(authData.provider == "twitter") {
      currentUser.name = authData.twitter.username;
      currentUser.imageUrl =  authData.twitter.cachedUserProfile.profile_image_url_https;

      // Cache the user image so we don't need to do this processing for every draw loop
      currentUserCachedImage = new Image();
      currentUserCachedImage.src = currentUser.imageUrl;
    }
  } else {
    // User logged out
    currentUser = null;
    
    // If they're not authenticated, auth them anonymously
    firebaseRef.authAnonymously(function(error, authData) {
      if (error) {
        console.log("Anonymous login Failed!", error);
      }
    });
  }
  
  updateDisplayName(currentUser);
});

function updateDisplayName(currentUser) {
  if(currentUser) {
    if(currentUser.type == "twitter") {
      $('#login').hide();
      $('#my-name').html('<img height=24 src="' + currentUser.imageUrl + '"> @' + currentUser.name);
    } else {
      $('#login').show();
      $('#my-name').text(currentUser.name);
    }
  }
}


// Handle login UI
$(document).ready(function() {
  if(currentUser) {
    // Update the display name again, just in case the user auth'd before the elements were ready
    updateDisplayName(currentUser);
  }

  $("#login").click(function() {
    firebaseRef.authWithOAuthPopup("twitter", function(error, authData) {
      if (error) {
        console.log("Twitter login Failed!", error);
      }
    });
  }).on("tap", function() {
    firebaseRef.authWithOAuthRedirect("twitter", function (error, authData) {
      if (error) {
        console.log("Twitter login Failed!", error);
      }
    });
  });
});


// Init the key event stuff
var KEY_STATUS = { keyDown: false };
for (var code in KEY_CODES) {
  KEY_STATUS[KEY_CODES[code]] = false;
}

// Capture key events
$(window).keydown(function (event) {
  KEY_STATUS.keyDown = true;
  if (KEY_CODES[event.keyCode]) {
    event.preventDefault();
    KEY_STATUS[KEY_CODES[event.keyCode]] = true;
  }
}).keyup(function (event) {
  KEY_STATUS.keyDown = false;
  if (KEY_CODES[event.keyCode]) {
    event.preventDefault();
    KEY_STATUS[KEY_CODES[event.keyCode]] = false;
  }
});

$(document).ready(function () {
  function buttonDown(event) {
    KEY_STATUS.keyDown = true;
    if (BUTTON_CODES[event.target.id]) {
      event.preventDefault();
      KEY_STATUS[BUTTON_CODES[event.target.id]] = true;
    }
  }
  function buttonUp(event) {
    KEY_STATUS.keyDown = false;
    if (BUTTON_CODES[event.target.id]) {
      event.preventDefault();
      KEY_STATUS[BUTTON_CODES[event.target.id]] = false;
    }
  }

  $("#touch-controls button").on('mousedown', buttonDown).on('mouseup', buttonUp);
  $("#touch-controls button").on('touchstart', buttonDown).on('touchend', buttonUp);

});

// Add player's ship to Firebase
var myship = firebaseRefGame.child('players').push();

// Schedule player removal on disconnect
myship.onDisconnect().remove();

// Leaderboard stuff

// Display the leaderboard
var scoreListRef = firebaseRefLeaderboard.child('scoreList');
var htmlForPath = {};

function handleScoreAdded(scoreSnapshot, lowerScoreName) {
	var newScoreRow = $("<tr/>");
	var postedScore = scoreSnapshot.val();
	if(postedScore.user.type == 'twitter') {
	  newScoreRow.append($("<td/>")
        .append('<img class="leaderboardImage" src="' + postedScore.user.imageUrl + '">')
        .append($("<strong/>").text('@' + postedScore.user.name)));
	  newScoreRow.append($("<td/>").text(postedScore.score));
	} else {
	  newScoreRow.append($("<td/>").append($("<strong/>").text(postedScore.user.name)));
	  newScoreRow.append($("<td/>").text(postedScore.score));
	}

	// Store a reference to the table row so we can get it again later.
	htmlForPath[scoreSnapshot.key()] = newScoreRow;

	// Insert the new score in the appropriate place in the GUI.
	if (lowerScoreName === null) {
		$("#leaderboardTable").append(newScoreRow);
    
    // If the Twitter account is gone, remove the broken photo
    $(".leaderboardImage").error(function () {
      $(this).remove();
    });
  } else {
		var lowerScoreRow = htmlForPath[lowerScoreName];
		lowerScoreRow.before(newScoreRow);
	}
}

// User a query to get the top scores
var scoreListView = scoreListRef.orderByChild("score").limitToLast(LEADERBOARD_SIZE);

scoreListView.on('child_added', function (newScoreSnapshot, prevScoreName) {
  handleScoreAdded(newScoreSnapshot, prevScoreName);
});


function setScore(score) {
   Game.score = score;
   updateScore();
}

function deltaScore(score) {
   Game.score += score;
   updateScore();
}

function updateScore() {
     $("#my-score").html(Game.score);
}

// Rendering stuff

Matrix = function (rows, columns) {
  var i, j;
  this.data = new Array(rows);
  for (i = 0; i < rows; i++) {
    this.data[i] = new Array(columns);
  }

  this.configure = function (rot, scale, transx, transy) {
    var rad = (rot * Math.PI)/180;
    var sin = Math.sin(rad) * scale;
    var cos = Math.cos(rad) * scale;
    this.set(cos, -sin, transx,
             sin,  cos, transy);
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
    this.name     = name;
    this.points   = points;

    this.vel = {
      x:   0,
      y:   0,
      rot: 0
    };

    this.acc = {
      x:   0,
      y:   0,
      rot: 0
    };
  };

  this.children = {};

  this.visible  = false;
  this.reap     = false;
  this.bridgesH = true;
  this.bridgesV = true;

  this.collidesWith = [];

  this.x     = 0;
  this.y     = 0;
  this.rot   = 0;
  this.scale = 1;

  this.currentNode = null;
  this.nextSprite  = null;

  this.preMove  = null;
  this.postMove = null;
  this.strokeStyle = "#000000";

  this.run = function(delta) {

    this.move(delta);
    this.updateGrid();

    this.context.save();
    this.configureTransform();
    this.draw();

    var canidates = this.findCollisionCanidates();

    this.matrix.configure(this.rot, this.scale, this.x, this.y);
    this.checkCollisionsAgainst(canidates);

    this.context.restore();

    if (this.bridgesH && this.currentNode && this.currentNode.dupe.horizontal) {
      this.x += this.currentNode.dupe.horizontal;
      this.context.save();
      this.configureTransform();
      this.draw();
      this.checkCollisionsAgainst(canidates);
      this.context.restore();
      if (this.currentNode) {
        this.x -= this.currentNode.dupe.horizontal;
      }
    }
    if (this.bridgesV && this.currentNode && this.currentNode.dupe.vertical) {
      this.y += this.currentNode.dupe.vertical;
      this.context.save();
      this.configureTransform();
      this.draw();
      this.checkCollisionsAgainst(canidates);
      this.context.restore();
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
      this.context.save();
      this.configureTransform();
      this.draw();
      this.checkCollisionsAgainst(canidates);
      this.context.restore();
      if (this.currentNode) {
        this.x -= this.currentNode.dupe.horizontal;
        this.y -= this.currentNode.dupe.vertical;
      }
    }
  };
  this.move = function (delta) {
    if (!this.visible) return;
    this.transPoints = null; // clear cached points

    if ($.isFunction(this.preMove)) {
      this.preMove(delta);
    }

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

    if ($.isFunction(this.postMove)) {
      this.postMove(delta);
    }
  };
  this.updateGrid = function () {
    if (!this.visible) return;
    var gridx = Math.floor(this.x / GRID_SIZE);
    var gridy = Math.floor(this.y / GRID_SIZE);
    gridx = (gridx >= this.grid.length) ? 0 : gridx;
    gridy = (gridy >= this.grid[0].length) ? 0 : gridy;
    gridx = (gridx < 0) ? this.grid.length-1 : gridx;
    gridy = (gridy < 0) ? this.grid[0].length-1 : gridy;
    var newNode = this.grid[gridx][gridy];
    if (newNode != this.currentNode) {
      if (this.currentNode) {
        this.currentNode.leave(this);
      }
      newNode.enter(this);
      this.currentNode = newNode;
    }

    if (KEY_STATUS.g && this.currentNode) {
      this.context.lineWidth = 3.0;
      this.context.strokeStyle = 'green';
      this.context.strokeRect(gridx*GRID_SIZE+2, gridy*GRID_SIZE+2, GRID_SIZE-4, GRID_SIZE-4);
      this.context.strokeStyle = 'black';
      this.context.lineWidth = 1.0;
    }
  };
  this.configureTransform = function () {
    if (!this.visible) return;

    var rad = (this.rot * Math.PI) / 180;

    this.context.translate(this.x, this.y);
    this.context.rotate(rad);
    this.context.scale(this.scale, this.scale);
  };
  this.draw = function () {
    if (!this.visible) return;

    this.context.lineWidth = 1.5 / this.scale;

    for (child in this.children) {
      this.children[child].draw();
    }

    this.context.beginPath();

    this.context.moveTo(this.points[0], this.points[1]);
    for (var i = 1; i < this.points.length/2; i++) {
      var xi = i*2;
      var yi = xi + 1;
      this.context.lineTo(this.points[xi], this.points[yi]);
    }

    this.context.closePath();
    this.context.strokeStyle = this.strokeStyle;

    if(this.eimg != null) {
        this.context.drawImage(this.eimg, 0, 0, 20, 20);
    }

    this.context.stroke();
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
    var count = trans.length/2;
    for (var i = 0; i < count; i++) {
      px = trans[i*2];
      py = trans[i*2 + 1];
      if (this.context.isPointInPath(px, py)) {
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
    for (var i = 0; i < this.points.length/2; i++) {
      var xi = i*2;
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
  this.init("ship",
            [-5,   4,
              0, -12,
              5,   4]);

  this.scale = 1.5;
  this.children.exhaust = new Sprite();
  this.children.exhaust.strokeStyle = "#ff0000";
  this.children.exhaust.init("exhaust",
                             [-3,  6,
                               0, 11,
                               3,  6]);

  this.bulletCounter = 0;
  this.strokeStyle = "#ffff00";
  this.keyFrame = 0;

  this.postMove = this.wrapPostMove;

  this.collidesWith = ["enemybullet", "enemyship"];

  this.previousKeyFrame = { vel: { rot: 0 }, accb: false };

  this.preMove = function (delta) {
    if (KEY_STATUS.left) {
      this.vel.rot = -SHIP_ROTATION_RATE;
    } else if (KEY_STATUS.right) {
      this.vel.rot = SHIP_ROTATION_RATE;
    } else {
      this.vel.rot = 0;
    }

    if (KEY_STATUS.up) {
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
    
    if (KEY_STATUS.space) {
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
    if ((this.vel.rot !== this.previousKeyFrame.vel.rot) || (KEY_STATUS.up !== this.previousKeyFrame.accb)) {
      myship.set({
        ship: {
          acc: this.acc,
          vel: this.vel,
          x: this.x,
          y: this.y,
          rot: this.rot,
          accb: KEY_STATUS.up
        },
        user: currentUser
      });
    }
    this.previousKeyFrame = { vel: { rot: this.vel.rot }, accb: KEY_STATUS.up };

    // Write new ship location to Firebase about every 60 frames
    this.keyFrame++;
    if (this.keyFrame % 60 == 0) {
      myship.set({
        ship: {
          acc: this.acc, 
          vel: this.vel, 
          x: this.x, 
          y: this.y, 
          rot: this.rot, 
          accb: KEY_STATUS.up 
        }, 
        user: currentUser
      });
    }
  };

  this.collision = function (other) {
    if(other != null) {
      Game.explosionAt(other.x, other.y);
    }
    else {
      Game.explosionAt(Game.ship.x, Game.ship.y);
    }
    Game.FSM.state = 'player_died';
    this.visible = false;
    if(this.currentNode != null) {
      this.currentNode.leave(this);
    }
    this.currentNode = null;
    Game.lives--;
    if (other != null && other.name == "enemyship") 
      deltaScore(Math.floor(100 * Math.random()));
  };

  this.draw = function () {
    if (!this.visible) return;

    this.context.lineWidth = 1.5 / this.scale;

    for (var child in this.children) {
      this.children[child].draw();
    }

    this.context.beginPath();

    this.context.moveTo(this.points[0], this.points[1]);
    for (var i = 1; i < this.points.length/2; i++) {
      var xi = i*2;
      var yi = xi + 1;
      this.context.lineTo(this.points[xi], this.points[yi]);
    }

    this.context.closePath();
    this.context.strokeStyle = this.strokeStyle;

    if(currentUserCachedImage) {
      this.context.drawImage(currentUserCachedImage, 0, 0, 20, 20);
    }

    this.context.stroke();
  };
};
Ship.prototype = new Sprite();

/**
 * Everyone elses' ship (because everyone else is... the enemy!)
 */
EnemyShip = function () {
  this.init("enemyship",
            [-5,   4,
              0, -12,
              5,   4]);

  this.children.exhaust = new Sprite();
  this.children.exhaust.strokeStyle = "#ff0000";
  this.children.exhaust.init("exhaust",
                             [-3,  6,
                               0, 11,
                               3,  6]);

  this.scale = 1.5;
  this.bulletCounter = 0;
  this.strokeStyle = "#ffffff";

  this.postMove = this.wrapPostMove;
  this.collidesWith = ["bullet"];

  this.draw = function () {
    if (!this.visible) return;

    this.context.lineWidth = 1.5 / this.scale;

    for (var child in this.children) {
      this.children[child].draw();
    }

    this.context.beginPath();

    this.context.moveTo(this.points[0], this.points[1]);
    for (var i = 1; i < this.points.length/2; i++) {
      var xi = i*2;
      var yi = xi + 1;
      this.context.lineTo(this.points[xi], this.points[yi]);
    }

    this.context.closePath();
    this.context.strokeStyle = this.strokeStyle;
    if(this.eimg != null) {
      this.context.drawImage(this.eimg, 0, 0, 20, 20);
    }
    this.context.stroke();
  };

  this.preMove = function (delta) {
    // limit the ship's speed
    if (Math.sqrt(this.vel.x * this.vel.x + this.vel.y * this.vel.y) > SHIP_MAX_SPEED) {
      this.vel.x *= 0.95;
      this.vel.y *= 0.95;
    }

    if(this.accb) {
      var rad = ((this.rot-90) * Math.PI)/180;
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

  this.configureTransform = function () {};
  this.draw = function () {
    if (this.visible) {
      this.context.save();
      this.context.lineWidth = 2;
      this.context.beginPath();
      this.context.moveTo(this.x-1, this.y-1);
      this.context.lineTo(this.x+1, this.y+1);
      this.context.moveTo(this.x+1, this.y-1);
      this.context.lineTo(this.x-1, this.y+1);
      this.context.strokeStyle = "#ffffff";
      this.context.stroke();
      this.context.restore();
    }
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
    if (other.name == "enemyship") deltaScore(100);
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

  this.configureTransform = function () {};
  this.draw = function () {
    if (this.visible) {
      this.context.save();
      this.context.lineWidth = 2;
      this.context.beginPath();
      this.context.moveTo(this.x-1, this.y-1);
      this.context.lineTo(this.x+1, this.y+1);
      this.context.moveTo(this.x+1, this.y-1);
      this.context.lineTo(this.x-1, this.y+1);
      this.context.strokeStyle = "#ff0000";
      this.context.stroke();
      this.context.restore();
    }
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
  for (var i = 0; i < 9; i++) {
    var rad = 2 * Math.PI * Math.random();
    var x = Math.cos(rad);
    var y = Math.sin(rad);
    this.lines.push([x, y, x*2, y*2]);
  }

  this.draw = function () {
    if (this.visible) {
      this.context.save();
      this.context.lineWidth = 1.0 / this.scale;
      this.context.beginPath();
      for (var i = 0; i < 9; i++) {
        var line = this.lines[i];
        this.context.moveTo(line[0], line[1]);
        this.context.lineTo(line[2], line[3]);
      }
      this.context.strokeStyle = "#CC3232";
      this.context.stroke();
      this.context.restore();
    }
  };

  this.preMove = function (delta) {
    if (this.visible) {
      this.scale += delta;
    }
    if (this.scale > 15) {
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
      empty = !ref.visible || collidables.indexOf(ref.name) == -1
      if (!empty) break;
    }
    return empty;
  };
};

// borrowed from typeface-0.14.js
// http://typeface.neocracy.org
Text = {
  renderGlyph: function (ctx, face, char) {
    this.context.strokeStyle = "#FFFFFF";
    this.context.fillStyle = "#FFFFFF";

    var glyph = face.glyphs[char];

    if (glyph.o) {

      var outline;
      if (glyph.cached_outline) {
        outline = glyph.cached_outline;
      } else {
        outline = glyph.o.split(' ');
        glyph.cached_outline = outline;
      }

      var outlineLength = outline.length;
      for (var i = 0; i < outlineLength; ) {

        var action = outline[i++];

        switch(action) {
          case 'm':
            ctx.moveTo(outline[i++], outline[i++]);
            break;
          case 'l':
            ctx.lineTo(outline[i++], outline[i++]);
            break;

          case 'q':
            var cpx = outline[i++];
            var cpy = outline[i++];
            ctx.quadraticCurveTo(outline[i++], outline[i++], cpx, cpy);
            break;

          case 'b':
            var x = outline[i++];
            var y = outline[i++];
            ctx.bezierCurveTo(outline[i++], outline[i++], outline[i++], outline[i++], x, y);
            break;
        }
      }
    }
    if (glyph.ha) {
      ctx.translate(glyph.ha, 0);
    }
  },

  renderText: function(text, size, x, y) {
    this.context.save();

    this.context.translate(x, y);

    var pixels = size * 72 / (this.face.resolution * 100);
    this.context.scale(pixels, -1 * pixels);
    this.context.beginPath();
    var chars = text.split('');
    var charsLength = chars.length;
    this.context.strokeStyle = "#FFFFFF";
    this.context.fillStyle = "#FFFFFF";
    for (var i = 0; i < charsLength; i++) {
      this.renderGlyph(this.context, this.face, chars[i]);
    }
    this.context.fill();

    this.context.restore();
  },

  context: null,
  face: null
};

/**
 * The game mechanics and main loop
 */
Game = {
  score: 0,
  lives: 0,

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
        KEY_STATUS.space = false; // hack so we don't shoot right away
        window.gameStart = false;
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

      setScore(0);
      Game.lives = STARTING_LIVES;

      this.state = 'spawn_ship';
    },
    spawn_ship: function () {
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
      if (Game.lives < 0) {
        this.state = 'end_game';
      } else {
        if (this.timer == null) {
          this.timer = Date.now();
        }
        // wait a second before spawning
        if (Date.now() - this.timer > 1000) {
          this.timer = null;
          this.state = 'spawn_ship';
        }
      }
    },
    end_game: function () {
      Text.renderText('GAME OVER RESTARTING...', 50, 30, Game.canvasHeight/2 + 10);
      if (this.timer == null) {
        this.timer = Date.now();
      }
      // wait 5 seconds then go back to start state
      if (Date.now() - this.timer > 5000) {
        this.timer = null;
        this.state = 'start';
        var postScoreRef = scoreListRef.push();
        postScoreRef.set({user: currentUser, score: Game.score});
      }

      window.gameStart = false;
    },
    execute: function () {
      this[this.state]();
    },
    state: 'boot'
  }

};


// Rendering the game in a JQuery
$(function () {
  var canvas = $("#canvas");
  Game.canvasWidth  = canvas.width();
  Game.canvasHeight = canvas.height();

  var context = canvas[0].getContext("2d");

  Text.context = context;
  Text.face = vector_battle;

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
      var node   = grid[i][j];
      node.north = grid[i][(j == 0) ? gridHeight-1 : j-1];
      node.south = grid[i][(j == gridHeight-1) ? 0 : j+1];
      node.west  = grid[(i == 0) ? gridWidth-1 : i-1][j];
      node.east  = grid[(i == gridWidth-1) ? 0 : i+1][j];
    }
  }

  // set up borders
  for (var i = 0; i < gridWidth; i++) {
    grid[i][0].dupe.vertical            =  Game.canvasHeight;
    grid[i][gridHeight-1].dupe.vertical = -Game.canvasHeight;
  }

  for (var j = 0; j < gridHeight; j++) {
    grid[0][j].dupe.horizontal           =  Game.canvasWidth;
    grid[gridWidth-1][j].dupe.horizontal = -Game.canvasWidth;
  }

  var sprites = [];
  Game.sprites = sprites;

  // so all the sprites can use it
  Sprite.prototype.context = context;
  Sprite.prototype.grid    = grid;
  Sprite.prototype.matrix  = new Matrix(2, 3);

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

  var canvasNode = canvas[0];

  // shim layer with setTimeout fallback
  // from here:
  // http://paulirish.com/2011/requestanimationframe-for-smart-animating/
  window.requestAnimFrame = (function () {
    return  window.requestAnimationFrame       ||
            window.webkitRequestAnimationFrame ||
            window.mozRequestAnimationFrame    ||
            window.oRequestAnimationFrame      ||
            window.msRequestAnimationFrame     ||
            function (/* function */ callback, /* DOMElement */ element) {
              window.setTimeout(callback, 1000 / 60);
            };
  })();

  var mainLoop = function () {
    context.clearRect(0, 0, Game.canvasWidth, Game.canvasHeight);

    Game.FSM.execute();

    if (KEY_STATUS.g) {
      context.beginPath();
      for (var i = 0; i < gridWidth; i++) {
        context.moveTo(i * GRID_SIZE, 0);
        context.lineTo(i * GRID_SIZE, Game.canvasHeight);
      }
      for (var j = 0; j < gridHeight; j++) {
        context.moveTo(0, j * GRID_SIZE);
        context.lineTo(Game.canvasWidth, j * GRID_SIZE);
      }
      context.closePath();
      context.stroke();
    }

    thisFrame = Date.now();
    elapsed = thisFrame - lastFrame;
    lastFrame = thisFrame;
    delta = elapsed / 30;

    var i = 0;
    for (var j in sprites) {
      var sprite = sprites[j];
      if(typeof(sprite) != undefined) {
        sprite.run(delta);
        if (sprite.reap) {
          sprite.reap = false;
          sprites.splice(i, 1);
          i--;
        }
      }
      i++;
    }

    // extra lives
    for (i = 0; i < Game.lives; i++) {
      context.save();
      extraLife.x = Game.canvasWidth - (8 * (i + 1));
      extraLife.y = 16;
      extraLife.configureTransform();
      extraLife.draw();
      context.restore();
    }

    frameCount++;
    elapsedCounter += elapsed;
    if (elapsedCounter > 1000) {
      elapsedCounter -= 1000;
      avgFramerate = frameCount;
      frameCount = 0;
    }

    requestAnimFrame(mainLoop, canvasNode);
  };

  // Presence
  var connectedRef = firebaseRef.child('.info/connected').on('value', function(snap) {
    if (snap.val()) {
      firebaseRef.child('.info/connected').off('value', connectedRef);
      mainLoop();
    }
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
      if (typeof(enemy.user.imageUrl) != undefined && enemy.user.imageUrl != null) {
        enemy.eimg = new Image();
        enemy.eimg.src = enemy.user.imageUrl;
      } else {
        enemy.eimg = null;
      }
      Game.sprites[snapshot.key()] = enemy;
    } else {
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
      if (typeof(enemy.user.imageUrl) != undefined && enemy.user.imageUrl != null) {
        enemy.eimg = new Image();
        enemy.eimg.src = enemy.user.imageUrl;
      } else {
        enemy.eimg = null;
      }
    } else {
    }
  });

  firebaseRefGame.child('players').on('child_removed', function (snapshot) {
    if (snapshot.key() !== myship.key()) {
      var enemy = Game.sprites[snapshot.key()];
      enemy.visible = false;
      delete Game.sprites[snapshot.key()];
      Game.explosionAt(snapshot.val().ship.x, snapshot.val().ship.y);
    } else {
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
});


// Prevent scrolling on mobile
$(document).on('touchstart', function(e) {
  if (e.target.nodeName !== 'INPUT') {
    e.preventDefault();
  }
});
