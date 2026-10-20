-- CreateTable
CREATE TABLE "Category" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "date" TIMESTAMPTZ(3) NOT NULL,
    "nameSortKey" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_code_key" ON "Category"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");

-- CreateIndex
CREATE INDEX "Product_categoryId_amount_idx" ON "Product"("categoryId", "amount");

-- CreateIndex
CREATE INDEX "Product_nameSortKey_idx" ON "Product"("nameSortKey");

-- CreateIndex
CREATE INDEX "Product_date_idx" ON "Product"("date");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Wymagane w sekcji 5 ograniczenia SQL oraz reguły porównywania bajtów UTF-8 (COLLATE "C")
ALTER TABLE "Product" ALTER COLUMN "nameSortKey" TYPE TEXT COLLATE "C";

ALTER TABLE "Product" ADD CONSTRAINT "product_price_nonnegative" CHECK ("price" >= 0);

ALTER TABLE "Product" ADD CONSTRAINT "product_amount_nonnegative" CHECK ("amount" >= 0);

ALTER TABLE "Product" ADD CONSTRAINT "product_id_positive" CHECK ("id" > 0);
