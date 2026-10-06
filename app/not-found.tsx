import Link from 'next/link'
 
export default function NotFound() {
  return (
    <div>
      <h2>Nie znaleziono</h2>
      <p>Przepraszamy, ale żądany zasób nie istnieje.</p>
      <Link href="/">Wróć na stronę główną</Link>
    </div>
  )
}
