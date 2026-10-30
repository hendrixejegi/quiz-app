export default function ParticipantIdentityFields({
  value,
  onChange,
  prefix = 'player',
  home = false,
}) {
  return (
    <>
      <label className="field-label" htmlFor={`${prefix}-name`}>
        YOUR NAME
      </label>
      <input
        id={`${prefix}-name`}
        className="text-input"
        maxLength="80"
        autoComplete="name"
        placeholder="Your name"
        value={value.name}
        onChange={(event) => onChange({ ...value, name: event.target.value })}
        required
      />
      <label className="field-label" htmlFor={`${prefix}-display-name`}>
        DISPLAY NAME
      </label>
      <input
        id={`${prefix}-display-name`}
        className="text-input"
        maxLength="32"
        placeholder={
          home
            ? 'How you’ll appear in the quiz'
            : 'How you’ll appear on the leaderboard'
        }
        value={value.display_name}
        onChange={(event) =>
          onChange({ ...value, display_name: event.target.value })
        }
        required
      />
    </>
  );
}
