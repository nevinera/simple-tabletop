// Joining: pick a seat before touching the table.
export function SeatPicker({ seats, onPick }) {
  return (
    <div className="seat-picker" role="dialog" aria-label="Pick a seat">
      <div className="seat-picker-panel">
        <h2>Pick a seat</h2>
        {seats.length === 0 ? (
          <p className="menu-note">Every seat is taken.</p>
        ) : (
          <div className="seat-picker-seats">
            {seats.map((seat) => (
              <button key={seat.id} type="button" className="menu-item" onClick={() => onPick(seat.id)}>
                <span className="seat-swatch" style={{ background: seat.color }} aria-hidden="true" />
                {seat.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
