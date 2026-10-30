export default function AnswerReview({ event }) {
  return (
    <section className="answer-review">
      <span className="section-kicker">YOUR ANSWERS</span>
      <h2>Question review</h2>
      {(event.answer_review || []).map((item) => (
        <article
          className={`review-row outcome-${item.outcome}`}
          key={item.position}
        >
          <div className="review-heading">
            <span>QUESTION {String(item.position + 1).padStart(2, '0')}</span>
            <strong>{item.outcome.toUpperCase()}</strong>
          </div>
          <h3>{item.prompt}</h3>
          <p>
            Your answer: <strong>{item.selected_answer ?? 'No answer'}</strong>
          </p>
          <p>
            Correct answer: <strong>{item.correct_answer}</strong>
          </p>
        </article>
      ))}
    </section>
  );
}
