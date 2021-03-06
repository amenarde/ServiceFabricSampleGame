﻿// ------------------------------------------------------------
//  Copyright (c) Microsoft Corporation.  All rights reserved.
//  Licensed under the MIT License (MIT). See License.txt in the repo root for license information.
// ------------------------------------------------------------


/**
 * These times represent the frequency of client draws and requests, and should be chosen on the basis of a few factors:
 * CLIENT_REFRESH_TIME: how fast client's game state is redrawn // should be most often since does not send messages
 * SERVER_READ_TIME: how often client will try to get new state, should be second most often since we can expect the game state as a
 *      whole to update more frequently than a single players game state.
 * SERVER_PUSH_TIME: Does not need to be often because of client refreshing, but too long will lead to bad response for other clients.
 */
var CLIENT_REFRESH_TIME = 40;
var SERVER_READ_TIME = 30;
var SERVER_PUSH_TIME = 10;
var ROOM_GET_TIME = 1000; //How often we refresh the rooms in login screen

var ROOM_OPTIONS = [
    "Office",
    "Garden",
    "Cafe"
];

var drawgamerefresh;
var showroomrefresh;
var statusblinktimeout;


// These structures are used to manage the relevant game state for the client and effectively communicate with the controller.
var clientgamestate =
{
    'playerid': null,
    'roomid': null,
    'XPos': 0,
    'YPos': 0,
    'Color': null,
    'RoomData': null,
    'RoomType': null
};
var servergamestate =
{
    'XPos': 0,
    'YPos': 0,
    'Color': null
};


/**
 * On window load hide irrelevant divs to maintain order and start to retrieve rooms from backend.
 */
window.onload = function() {
    document.getElementsByClassName("gameDiv")[0].style.display = "none";
    showrooms(true);
    showroomrefresh = setInterval(function() {
            showrooms(false);
        },
        ROOM_GET_TIME);
};


//To help prevent missing a keyup, causing the player to continuously move
window.onblur = function() {
    if (gameArea.keys) {
        gameArea.keys[37] = false;
        gameArea.keys[38] = false;
        gameArea.keys[39] = false;
        gameArea.keys[40] = false;
    }
};


// On window close make an attempt to end the game.
window.addEventListener("beforeunload",
    function() {
        if (clientgamestate.playerid !== null)
            endgame();
    },
    false);

function updateStatus(statustext) {
    var status = document.getElementById("status");
    status.innerHTML = statustext;

    if (statusblinktimeout !== null) {
        clearTimeout(statusblinktimeout);
    }

    document.getElementById("status_bar").style.backgroundColor = "lightcoral";

    statusblinktimeout = window.setTimeout(
        function() {
            document.getElementById("status_bar").style.backgroundColor = "whitesmoke";
        },
        1500);
}


/**
 * LOGIN SECTION
 * newgame
 * showrooms
 */

/**
 * Sends a request to the controller to establish a new game.
 * Initializes the game canvas and retrieves the first server state that sets the client state
 * @argument {boolean} bool true if chooosing an already existing room, false if a new room.
 * @argument {button} context so that the function can reach in and get the name of the room.
 * These arguments tell this function where to gather the relevant information from the html.
 */
function newgame(bool, context) {
    var roomid;
    var roomType;
    var playerid = document.getElementById("pidform").value;

    //Decides where to get room name, which is either the button pressed or the fields on the new room entry form
    if (bool === true) {
        roomid = context.name.substring(0, context.name.indexOf(","));
        roomType = context.name.substring(context.name.indexOf(",") + 1);
    } else {
        roomid = document.getElementById("newgamename").value;
        roomType = document.getElementById("newgametype").value;
    }


    //Only accept nonempty alphanumeric usernames under 20 characters long
    if (!/^(?=.{0,20}$)[a-z0-9]+$/i.exec(roomid)) {
        updateStatus("Please enter an alphanumeric room name under 20 characters long");
        return;
    }
    if (!/^(?=.{0,20}$)[a-z0-9]+$/i.exec(playerid)) {
        updateStatus("Please enter an alphanumeric username under 20 characters long");
        return;
    }
    if (roomType === "") {
        updateStatus("Something went wrong with room typing");
        return;
    }

    updateStatus("Attempting to log in");

    //Upon response
    var http = new XMLHttpRequest();
    http.onreadystatechange = function() {
        if (http.readyState === 4) {
            var returnData = JSON.parse(http.responseText);
            if (http.status < 400) {
                if (returnData) {
                    updateStatus("Successfully logged in");

                    clientgamestate.RoomType = returnData.value;

                    clearInterval(showroomrefresh);

                    clientgamestate.playerid = playerid;
                    clientgamestate.roomid = roomid;

                    //initialize canvas
                    gameArea.start();

                    //run getgame in the "new game" setting
                    setTimeout(function() { getgame(true, true); }, 100);
                    

                    //hide login-related html
                    document.getElementsByClassName("gameDiv")[0].style.display = "";
                    document.getElementsByClassName("loginDiv")[0].style.display = "none";
                } else {
                    updateStatus("Something went wrong, please referesh webpage");
                }
            } else {
                updateStatus(returnData.value);
            }
        }
    };

    http.open("GET",
        "api/Player/NewGame/?playerid=" +
        document.getElementById("pidform").value +
        "&roomid=" +
        roomid +
        "&RoomType=" +
        roomType);
    http.send();
}


/**
 * Asks the controller for the current available rooms. This allows the user to see and choose all available rooms, or
 * to make their own. Refreshes periodically until a game has begun. Handles populating the related table.
 * @argument {boolean} firsttime Determines whether to draw the room input box or not
 */
function showrooms(firsttime) {
    //Upon response
    var http = new XMLHttpRequest();
    http.onreadystatechange = function() {
        if (http.readyState === 4) {
            var returnData = JSON.parse(http.responseText);
            if (http.status < 400) {
                if (returnData) {
                    var table = document.getElementById("roomstable");

                    //Cell types
                    var row;
                    var namecell;
                    var name;
                    var typecell;
                    var type;
                    var numcell;
                    var num;
                    var buttoncell;
                    var button;

                    var i;

                    //Only create table header and entry form once
                    if (firsttime) {
                        //Header
                        row = table.insertRow();
                        namecell = row.insertCell();
                        name = document.createTextNode("  Room Name  ");
                        namecell.appendChild(name);
                        typecell = row.insertCell();
                        type = document.createTextNode("  Room Type  ");
                        typecell.appendChild(type);
                        numcell = row.insertCell();
                        num = document.createTextNode("# Players");
                        numcell.appendChild(num);
                        buttoncell = row.insertCell();
                        button = document.createTextNode("Choose / Create");
                        buttoncell.appendChild(button);

                        //New Room Entry Form
                        row = table.insertRow();

                        namecell = row.insertCell();
                        name = document.createElement("INPUT");
                        name.setAttribute("type", "text");
                        name.setAttribute("id", "newgamename");
                        name.setAttribute("placeholder", "Room Name");
                        namecell.appendChild(name);

                        typecell = row.insertCell();
                        type = document.createElement("select");
                        for (i = 0; i < ROOM_OPTIONS.length; i++) {
                            var option = document.createElement("option");
                            option.value = ROOM_OPTIONS[i];
                            option.text = ROOM_OPTIONS[i];
                            type.appendChild(option);
                        }
                        type.setAttribute("id", "newgametype");
                        typecell.appendChild(type);

                        numcell = row.insertCell();
                        num = document.createTextNode("");
                        numcell.appendChild(num);

                        buttoncell = row.insertCell();
                        button = document.createElement("button");
                        button.setAttribute("type", "button");
                        button.setAttribute("id", "newgamebutton");
                        button.setAttribute("onclick", "newgame(false, this)");
                        buttoncell.appendChild(button);
                    }

                    //Delete all rows beside the first two
                    while (table.rows.length > 2) {
                        table.deleteRow(2);
                    }

                    //Populate table with new room data
                    for (i = 0; i < returnData.length; i++) {
                        row = table.insertRow();
                        namecell = row.insertCell();
                        name = document.createTextNode(returnData[i].Key);
                        namecell.appendChild(name);
                        typecell = row.insertCell();
                        type = document.createTextNode(returnData[i].Value.RoomType);
                        typecell.appendChild(type);
                        numcell = row.insertCell();
                        num = document.createTextNode(returnData[i].Value.NumPlayers);
                        numcell.appendChild(num);

                        buttoncell = row.insertCell();
                        button = document.createElement("button");
                        button.setAttribute("type", "button");
                        button.setAttribute("name", returnData[i].Key + "," + returnData[i].Value.RoomType);
                        button.setAttribute("onclick", "newgame(true, this)");
                        buttoncell.appendChild(button);
                    }

                } else {
                    updateStatus("Something went wrong, please referesh webpage");
                }
            } else {
                updateStatus(returnData.value);
            }
        }
    };

    http.open("GET", "api/Room/GetRooms");
    http.send();
}

/**
 * UPDATE GAME SECTION
 * updategamewatcher
 * toUpdate
 * updategame
 * endgame
 */

/**
 * This function looks for key presses so that it knows to update the clients game view. This function is designed to allow for smooth
 * gameplay for the player. A different watcher will look for these changes and periodically push to the backend.
 * Limits are used to keep the player in the visible game area.
 */
function updategamewatcher() {
    if (gameArea.keys && gameArea.keys[37]) { //arrow left
        //gameArea.keys[37] = false;

        if (clientgamestate.XPos <= -6) {
            clientgamestate.XPos = -6;
        } else {
            clientgamestate.XPos -= 1;
        }

        //this passes in a copy of the game state, reference does not garauntee consistency for duration of draw function
        gameArea.drawGame(clientgamestate.RoomData, false);
    } else if (gameArea.keys && gameArea.keys[39]) { //arrow right
        //gameArea.keys[39] = false;

        if (clientgamestate.XPos >= 94) {
            clientgamestate.XPos = 94;
        } else {
            clientgamestate.XPos += 1;
        }

        gameArea.drawGame(clientgamestate.RoomData, false);
    }
    if (gameArea.keys && gameArea.keys[38]) { //arrow down
        //gameArea.keys[38] = false;

        if (clientgamestate.YPos <= -6) {
            clientgamestate.YPos = -6;
        } else {
            clientgamestate.YPos -= 1;
        }

        gameArea.drawGame(clientgamestate.RoomData, false);
    } else if (gameArea.keys && gameArea.keys[40]) { //arrow up
        //gameArea.keys[40] = false;

        if (clientgamestate.YPos >= 90) {
            clientgamestate.YPos = 90;
        } else {
            clientgamestate.YPos += 1;
        }

        gameArea.drawGame(clientgamestate.RoomData, false);

    }

}

/**
 * Validates color changes when they are entered.
 */
function updateColor() {
    var colorchange = document.getElementById("colorupdateform").value;
    if (colorchange === "") {
        updateStatus("You must enter a HEX Color code.");
        return;
    }

    //Clean up for regex
    if (!colorchange.startsWith("#")) {
        colorchange = "#".concat(colorchange);
    }

    //blackbox regex that verifies color formatting
    var validColor = /(^#[0-9A-F]{6}$)|(^#[0-9A-F]{3}$)/i.test(colorchange);

    if (!validColor) {
        updateStatus("This is not a valid HEX Color code. Try #E79380");
        document.getElementById("colorupdateform").value = "";
    } else {
        colorchange = colorchange.substring(1);
        clientgamestate.Color = colorchange;
        document.getElementById("colorupdateform").value = "";
    }
}

/**
 * Checks whether the client's state has deviated from the last known server state, which would prompt an update request.
 */
function toupdate() {
    if (clientgamestate.XPos !== servergamestate.XPos ||
        clientgamestate.YPos !== servergamestate.YPos ||
        clientgamestate.Color !== servergamestate.Color) {
        updategame();
    } else {
        //Recall this watcher
        window.setTimeout(function() { toupdate(); }, SERVER_PUSH_TIME);
    }
}

/**
 * If the update change listener finds that the client state has deviated from the server state, it will prompt a message to the
 * backend, sent here.
 */
function updategame() {

    //Upon response
    var http = new XMLHttpRequest();
    http.onreadystatechange = function() {
        if (http.readyState === 4) {

            // Recall the watcher upon previous successful update
            window.setTimeout(function() { toupdate(); }, SERVER_PUSH_TIME);

            var returnData = http.responseText;
            if (http.status < 400) {
                if (!returnData) {
                    updateStatus("Something went wrong, please refresh the page.");
                }
            } else {
                updateStatus(returnData);
            }
        }
    };

    var player =
    {
        'XPos': clientgamestate.XPos,
        'YPos': clientgamestate.YPos,
        'Color': clientgamestate.Color
    };

    http.open("GET",
        "api/Room/UpdateGame/?playerid=" +
        clientgamestate.playerid +
        "&roomid=" +
        clientgamestate.roomid +
        "&player=" +
        JSON.stringify(player));
    http.send();
}

/**
 * Reaches in and gets the current game state. If it is the first time the game state is being retrieves, it writes over
 * the client state to ensure that the client state begins as the server state.
 * @param {any} overrideClientState Run during newgame to sync both states
 * @param {any} newgame Begins some of the long term running application during initialization
 */
function getgame(overrideClientState, newgame) {

    //Upon response
    var http = new XMLHttpRequest();
    http.onreadystatechange = function() {
        if (http.readyState === 4) {
            var returnData = http.responseText;

            if (http.status === 500) {
                //500 Errors are transient, try again
                window.setTimeout(getgame(false, false), SERVER_READ_TIME);
            } else if (http.status < 400) {
                if (returnData) {
                    returnData = JSON.parse(returnData);
                    clientgamestate.RoomData = returnData;
                    //If new game, client state will ebcome server state
                    gameArea.drawGame(clientgamestate.RoomData, overrideClientState);


                    //If first time, start listeners
                    if (newgame) {
                        window.setTimeout(getgame(false, false), 0);
                        drawgamerefresh = setInterval(function() {
                                updategamewatcher();
                            },
                            CLIENT_REFRESH_TIME);
                        window.setTimeout(function() { toupdate(); }, 0);
                    } else {
                        window.setTimeout(getgame(false, false), SERVER_READ_TIME);
                    }
                } else {
                    updateStatus("Something went wrong. Please refresh webpage.");
                    window.setTimeout(getgame(false, false), SERVER_READ_TIME);
                }
            } else if (http.status === 400) {
                //This scenario would be hit if the player is kicked by the server for inactivity and is also the last person in a room
                location.reload();
            } else {
                updateStatus(returnData);
                window.setTimeout(getgame(false, false), SERVER_READ_TIME);
            }
        }
    };
    http.open("GET", "api/Room/GetGame/?roomid=" + clientgamestate.roomid);
    http.send();
}

/**
 * Responsible for ending the game. Pings the current room to initiate a room ending.
 */
function endgame() {

    clearInterval(drawgamerefresh);

    //Upon response
    var http = new XMLHttpRequest();
    http.onreadystatechange = function() {
        if (http.readyState === 4) {
            var returnData = http.responseText;

            if (http.status < 400) {
                //If successful, refresh webpage to original state
                location.reload();
            } else {
                updateStatus(returnData);
            }
        }
    };

    http.open("GET",
        "api/Room/EndGame/?playerid=" +
        clientgamestate.playerid +
        "&roomid=" +
        clientgamestate.roomid);
    http.send();
}

/**
 * Statistics Section
 * getPlayerstats
 */

function getPlayerStats() {

    updateStatus("Player statistics request sent. This may take a minute.");

    //Upon response
    var http = new XMLHttpRequest();
    http.onreadystatechange = function() {
        if (http.readyState === 4) {
            var returnData = JSON.parse(http.responseText);
            if (http.status < 400) {
                if (returnData) {
                    document.getElementById("status").innerHTML =
                        "Num. Accounts: " +
                        returnData.NumAccounts +
                        " | " +
                        "Num. Logged in: " +
                        returnData.NumLoggedIn +
                        " | " +
                        "Avg. Logins / Account: " +
                        returnData.AvgNumLogins.toFixed(3) +
                        " | " +
                        "Average Account Age (hours): " +
                        (returnData.AvgAccountAge / 3600.0).toFixed(3);
                } else {
                    updateStatus("Something went wrong with gathering stats.");
                }
            } else {
                updateStatus(returnData.value);
            }
        }
    };

    http.open("GET", "api/Player/GetStats/");
    http.send();
}