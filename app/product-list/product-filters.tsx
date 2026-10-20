'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CatalogQueryCriteria } from '../lib/params';

interface ProductFiltersProps {
  initialCriteria: CatalogQueryCriteria;
}

export default function ProductFilters({ initialCriteria }: ProductFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Pobierz aktualne wartości z URL lub użyj przekazanych kryteriów początkowych
  const currentType = searchParams.get('type') ?? initialCriteria.type;
  const currentStock = searchParams.get('stock') ?? initialCriteria.stock;
  const currentSort = searchParams.get('sort') ?? initialCriteria.sort;

  const handleChange = (name: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'all' && (name === 'type' || name === 'stock')) {
      params.delete(name);
    } else if (value === 'name' && name === 'sort') {
      params.delete(name);
    } else {
      params.set(name, value);
    }

    const queryString = params.toString();
    // Używamy push, aby każde świadome zatwierdzenie/wybór filtra
    // tworzyło wpis w historii przeglądarki (obsługa Wstecz i Dalej)
    router.push(`/product-list${queryString ? `?${queryString}` : ''}`);
  };

  return (
    <div className="filters-container content-box" style={{ marginBottom: '2rem' }}>
      <form
        action="/product-list"
        method="GET"
        className="filters-form"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <div className="filters-grid">
          {/* Filtr Kategoria (type) */}
          <div className="filter-group">
            <label htmlFor="filter-type">Kategoria:</label>
            <select
              id="filter-type"
              name="type"
              value={currentType}
              onChange={(e) => handleChange('type', e.target.value)}
              className="filter-select"
            >
              <option value="all">Wszystkie kategorie</option>
              <option value="cpu">Procesory (CPU)</option>
              <option value="gpu">Karty graficzne (GPU)</option>
              <option value="ram">Pamięci RAM</option>
              <option value="disk">Dyski (SSD/HDD)</option>
            </select>
          </div>

          {/* Filtr Dostępność (stock) */}
          <div className="filter-group">
            <label htmlFor="filter-stock">Dostępność:</label>
            <select
              id="filter-stock"
              name="stock"
              value={currentStock}
              onChange={(e) => handleChange('stock', e.target.value)}
              className="filter-select"
            >
              <option value="all">Wszystkie stany</option>
              <option value="available">Tylko dostępne (&gt; 0 szt.)</option>
              <option value="unavailable">Chwilowo niedostępne (0 szt.)</option>
            </select>
          </div>

          {/* Sortowanie (sort) */}
          <div className="filter-group">
            <label htmlFor="filter-sort">Kolejność:</label>
            <select
              id="filter-sort"
              name="sort"
              value={currentSort}
              onChange={(e) => handleChange('sort', e.target.value)}
              className="filter-select"
            >
              <option value="name">Nazwa rosnąco (A-Z)</option>
              <option value="newest">Data dodania (najnowsze)</option>
            </select>
          </div>

          {/* Akcje */}
          <div className="filter-actions">
            <Link
              href="/product-list"
              className="btn-action btn-reset"
              style={{ textDecoration: 'none', textAlign: 'center' }}
            >
              Wyczyść filtry
            </Link>
          </div>
        </div>
      </form>
    </div>
  );
}
