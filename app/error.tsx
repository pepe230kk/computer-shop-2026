'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="error">
      <h2>Wystąpił nieoczekiwany błąd serwera.</h2>
      <p>Przepraszamy za utrudnienia.</p>
      <button className="btn-action" onClick={() => reset()}>
        Spróbuj ponownie
      </button>
    </div>
  );
}
