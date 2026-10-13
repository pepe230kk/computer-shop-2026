import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="error">
      <h2>Nie znaleziono</h2>
      <p>Przepraszamy, ale żądany zasób nie istnieje.</p>
      <Link href="/" className="btn-action">
        Wróć na stronę główną
      </Link>
    </div>
  );
}
