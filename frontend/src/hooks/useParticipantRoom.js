import { useEffect, useState } from 'react';
import { api } from '../api';
import { subscribeParticipant } from '../live/participantSubscription';
import { useAsyncTask } from './useAsyncTask';
export function useParticipantRoom(joinCode) {
  const [snapshot, setSnapshot] = useState({
    event: null,
    participant: null,
    error: '',
    loading: true,
  });
  const [generation, setGeneration] = useState(0);
  const [joinForm, setJoinForm] = useState({ name: '', display_name: '' });
  const [optimistic, setOptimistic] = useState(null);
  const joinTask = useAsyncTask();
  const answerTask = useAsyncTask();
  useEffect(
    () =>
      subscribeParticipant({
        joinCode,
        request: api,
        storage: sessionStorage,
        onChange: (updates) =>
          setSnapshot((current) => ({ ...current, ...updates })),
      }),
    [joinCode, generation],
  );
  function join(event) {
    event.preventDefault();
    if (joinTask.busy) return;
    joinTask.run(
      (signal) =>
        api(`/api/events/${encodeURIComponent(joinCode)}/participants`, {
          method: 'POST',
          signal,
          body: JSON.stringify(joinForm),
        }),
      (result) => {
        sessionStorage.setItem(
          `quiz:${joinCode}:reconnect`,
          result.reconnect_token,
        );
        setOptimistic(null);
        setSnapshot((current) => ({
          ...current,
          participant: result,
          error: '',
        }));
        setGeneration((current) => current + 1);
      },
    );
  }
  const position = snapshot.event?.current_question_position;
  function submitAnswer(choiceIndex) {
    if (
      position == null ||
      snapshot.event.answer_choice_index != null ||
      answerTask.busy ||
      !snapshot.participant
    )
      return;
    setOptimistic({ position, choiceIndex });
    answerTask.run(
      async (signal) => {
        try {
          return await api(
            `/api/events/${encodeURIComponent(joinCode)}/answers`,
            {
              method: 'POST',
              signal,
              headers: {
                Authorization: `Bearer ${snapshot.participant.reconnect_token}`,
              },
              body: JSON.stringify({ choice_index: choiceIndex }),
            },
          );
        } catch (reason) {
          if (!signal.aborted) setOptimistic(null);
          throw reason;
        }
      },
      () =>
        setSnapshot((current) =>
          current.event?.current_question_position === position
            ? {
                ...current,
                event: { ...current.event, answer_choice_index: choiceIndex },
              }
            : current,
        ),
    );
  }
  return {
    ...snapshot,
    joinForm,
    setJoinForm,
    join,
    busy: joinTask.busy,
    error: snapshot.error || joinTask.error || answerTask.error,
    answerSubmitting: answerTask.busy,
    submitAnswer,
    answeredChoice:
      snapshot.event?.answer_choice_index ??
      (optimistic && optimistic.position === position
        ? optimistic.choiceIndex
        : null),
  };
}
