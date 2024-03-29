import { pageView } from "../types/pageView"

/*
    Displays the room code to the host, which they can then show to other players
*/
function RoomCode({ setView, room }: { setView: any, room: number}) {
    return (
        <div id="playing" className="container">
            <p> Roomcode: {room} </p>
            <p> You are player A </p>   {/* Host is always player A */}
            <button onClick={() => setView(pageView.GAMEMODE_SELECT)}>Select Gamemode</button>
        </div>
    )
}

export default RoomCode