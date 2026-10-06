import { NextResponse } from "next/server";
import { getProducts, SortOption, Product } from "@/app/lib/repository";
import { z } from "zod";

const QuerySchema = z.object({
  sortBy: z.enum(["name-desc", "date-desc"]).optional(),
  category: z.enum(["cpu", "gpu", "ram", "disk"]).optional(),
  availableOnly: z.enum(["true", "false"]).optional(),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  const sortBy = searchParams.get("sortBy") || undefined;
  const category = searchParams.get("category") || undefined;
  const availableOnly = searchParams.get("availableOnly") || undefined;

  const parsed = QuerySchema.safeParse({ sortBy, category, availableOnly });

  if (!parsed.success) {
    return NextResponse.json({ error: "Nieprawidłowe parametry zapytania" }, { status: 400 });
  }

  try {
    const products = await getProducts({
      sortBy: parsed.data.sortBy as SortOption,
      category: parsed.data.category as Product["type"],
      availableOnly: parsed.data.availableOnly === "true",
    });

    return NextResponse.json(products);
  } catch (error) {
    console.error("API error", error);
    return NextResponse.json({ error: "Błąd serwera" }, { status: 500 });
  }
}
