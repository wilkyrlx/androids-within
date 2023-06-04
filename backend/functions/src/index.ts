import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

import express, { Request, Response } from "express";
import cors from "cors";
import GameRoom from "./types/GameRoom";
import { Status } from "./types/status";

// ========================== Setup ============================================
const corsOptions = {
    origin: '*',
    credentials: true,            //access-control-allow-credentials:true
    optionSuccessStatus: 200,
}
const app = express();
app.use(cors(corsOptions)) // Use this after the variable declaration
// TODO: use realtime firestore instead of websockets

// =============================================================================


// Helper function to check if roomID is valid, returns roomID as a number
function isValidRoom(roomID: string, res: Response) {
    // Check if roomID is a number
    const roomIDNum = Number(roomID);
    if (isNaN(roomIDNum)) {
        res.status(400).json({ error: 'Invalid parameter. Numbers expected.' });
        return;
    }

    // Check if roomID exists
    if (!(roomIDNum in gameRooms)) {
        res.status(400).json({ error: 'Invalid roomID.' });
        return;
    }

    return roomIDNum;
}

// Dictionary of game rooms. Key: room code, Value: room object
const gameRooms: { [key: number]: GameRoom } = {};
let numRooms: number = 0;

/** create-game endpoint
 * 
 * @param sheetID - The Google Sheet ID associated with the game room
 * @param numPlayers - The exact number of players in the game room
 */
app.get('/api/create-game/:sheetID/:numPlayers', (req: Request, res: Response) => {
    const { sheetID, numPlayers } = req.params;

    // Check if gameMode and numPlayers
    const numPlayersNum = Number(numPlayers);
    if (isNaN(numPlayersNum)) {
        res.status(400).json({ error: 'Invalid parameter. Numbers expected.' });
        return;
    }

    // Create a new game room
    const roomID: number = numRooms;    
    const newGameRoom = new GameRoom(roomID, sheetID, numPlayersNum);

    // Add the game room to the shared dictionary
    gameRooms[roomID] = newGameRoom;
    numRooms += 1;

    // Return the roomID
    res.status(200).json({ roomID: roomID });
});

/** join-game endpoint
 * joins a game that has already been created, given a roomID. Returns an error 
 * if the roomID is invalid or if the game room is full. Assigns the player an ID
 * based on their position in the 'players' array.
 * 
 * @param roomID - The room code
 */
app.get('/api/join-game/:roomID', (req: Request, res: Response) => {
    const { roomID } = req.params;

    const roomIDNum: number = isValidRoom(roomID, res) as number;

    // Check if game room is full
    const gameRoom = gameRooms[roomIDNum];
    if (gameRoom.players.length >= gameRoom.numPlayers) {
        res.status(400).json({ error: 'Game room is full.' });
        return;
    }

    // Create a new player
    const playerID = gameRoom.players.length;   // TODO: in the future, playerID could be chosen by the player

    // Add the player to the game room
    gameRoom.addPlayer(playerID);

    // Return the playerID
    res.status(200).json({ playerID: playerID });
});

// get-game endpoint, returns the game room object. DEVELOPER ONLY ENDPOINT
app.get('/api/get-game/:roomID', (req: Request, res: Response) => {
    const { roomID } = req.params;

    const roomIDNum: number = isValidRoom(roomID, res) as number;

    // Return the game room
    res.status(200).json({ gameRoom: gameRooms[roomIDNum] });
});

/** game-status endpoint, returns how many players have joined out of the total */
app.get('/api/game-status/:roomID', (req: Request, res: Response) => {
    const { roomID } = req.params;

    const roomIDNum: number = isValidRoom(roomID, res) as number;

    // return the number of players that have joined
    const room: GameRoom = gameRooms[roomIDNum];
    const numPlayersActual: number = room.players.length;
    const numPlayersExpected: number = room.numPlayers;
    
    let retStatus = "waiting"
    if (room.status == Status.WAITING && numPlayersActual == numPlayersExpected) {
        retStatus = "ready"
    }

    res.status(200).json({ status: retStatus, actualPlayers: numPlayersActual, expectedPlayers: numPlayersExpected });

});

/** set-gamemode endpoint, sets the gamemode of the game room */
app.get('/api/set-gamemode/:roomID/:gamemode', (req: Request, res: Response) => {
    const { roomID, gamemode } = req.params;

    // Check if roomID and gamemode is a number
    const roomIDNum = Number(roomID);
    const gamemodeNum = Number(gamemode);
    if (isNaN(roomIDNum) || isNaN(gamemodeNum)) {
        res.status(400).json({ error: 'Invalid parameter. Numbers expected.' });
        return;
    }

    // Check if roomID exists
    if (!(roomIDNum in gameRooms)) {
        res.status(400).json({ error: 'Invalid roomID.' });
        return;
    }

    // set gamemode
    const room: GameRoom = gameRooms[roomIDNum];
    room.gameMode = gamemodeNum;
    room.generateRoles();

    room.status = Status.WAITING;

    // Return the game room
    res.status(200).json({ gameRoom: room });
});

app.get('/api/reset-status/:roomID', (req: Request, res: Response) => {
    const { roomID } = req.params;

    // Check if roomID is valid
    const roomIDNum: number = isValidRoom(roomID, res) as number;

    const room: GameRoom = gameRooms[roomIDNum];
    room.status = Status.WAITING_ON_HOST;

    // Return the game room
    res.status(200).json({ gameRoom: room });
});

/** get-role endpoint, gets the role for a player given a room and player ID */
app.get('/api/get-role/:roomID/:playerID', (req: Request, res: Response) => {
    const { roomID, playerID } = req.params;

    // Check if roomID and playerID is a number
    const roomIDNum = Number(roomID);
    const playerIDNum = Number(playerID);
    if (isNaN(roomIDNum) || isNaN(playerIDNum)) {
        res.status(400).json({ error: 'Invalid parameter. Numbers expected.' });
        return;
    }

    // Check if roomID exists
    if (!(roomIDNum in gameRooms)) {
        res.status(400).json({ error: 'Invalid roomID.' });
        return;
    }

    // Check if playerID exists
    if (playerIDNum >= gameRooms[roomIDNum].players.length) {
        res.status(400).json({ error: 'Invalid playerID.' });
        return;
    }

    const letter: string = String.fromCharCode(65 + playerIDNum)
    const role = gameRooms[roomIDNum].assignments[letter];

    // Return the role
    res.status(200).json({ name: letter, role: role });
});

/** get-all-roles endpoint */
app.get('/api/get-all-roles/:roomID', (req: Request, res: Response) => {
    const { roomID } = req.params;

    const roomIDNum: number = isValidRoom(roomID, res) as number;

    // Return the assignments
    res.status(200).json({ assignments: gameRooms[roomIDNum].assignments });
});
    

    






exports.app = functions.https.onRequest(app);