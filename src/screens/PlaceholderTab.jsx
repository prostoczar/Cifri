// Stand-in for Braining/Practice/Tricks — these modes are ported in a later stage.
export default function PlaceholderTab({ name }) {
  return (
    <div style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--txt3)' }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)', marginBottom: 6 }}>{name}</div>
      <div style={{ fontSize: 13 }}>Coming in the next build stage.</div>
    </div>
  );
}
