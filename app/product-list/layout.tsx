export default function ProductListLayout({
  children,
  recommended,
}: {
  children: React.ReactNode;
  recommended: React.ReactNode;
}) {
  return (
    <div className="product-list-layout-wrapper">
      <div className="catalog-main-content">{children}</div>
      {recommended}
    </div>
  );
}
