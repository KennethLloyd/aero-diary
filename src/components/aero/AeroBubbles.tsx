// Ambient floating Aero bubbles (ADR-0009). Sizes/positions mirror the prototype.
const BUBBLES = [
  { size: 60, left: '10%', duration: '18s', delay: '0s' },
  { size: 120, left: '75%', duration: '25s', delay: '-5s' },
  { size: 40, left: '85%', duration: '12s', delay: '-2s' },
  { size: 80, left: '25%', duration: '20s', delay: '-10s' },
]

export function AeroBubbles() {
  return (
    <>
      {BUBBLES.map((bubble) => (
        <div
          key={`${bubble.size}-${bubble.left}`}
          className="bubble"
          style={{
            width: bubble.size,
            height: bubble.size,
            left: bubble.left,
            animationDuration: bubble.duration,
            animationDelay: bubble.delay,
          }}
        />
      ))}
    </>
  )
}