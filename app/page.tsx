import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <div id="home">
      <Image
        src="/politechnika-krakowska-logo.svg"
        alt="Logo Politechniki Krakowskiej"
        width={160}
        height={160}
        priority
      />
      <h1>Sklep Komputerowy</h1>
      <p>
        Podstawa aplikacji sklepu komputerowego zrealizowana w ramach laboratorium 6
        z przedmiotu Programowanie BackEnd na Politechnice Krakowskiej.
      </p>
      <p>Autor: Krzysztof Kacprzak</p>
      <Link href="/product-list">Przejdź do katalogu produktów</Link>
    </div>
  );
}
