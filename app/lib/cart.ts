import "server-only";
import { headers } from "next/headers";
import { prisma } from "./db";
import { auth } from "@/lib/auth";

export interface CartItemView {
  id: number;
  productId: number;
  productCode: string;
  productName: string;
  productImage: string;
  unitPrice: number; // w groszach
  quantity: number;
  lineTotal: number; // w groszach
  availableStock: number;
}

export interface CartView {
  id: number | null;
  userId: string | null;
  items: CartItemView[];
  totalPrice: number; // w groszach
  totalItems: number;
}

/**
 * Bezpiecznie pobiera bieżącą sesję użytkownika na serwerze (Zero-Trust).
 */
export async function getSession() {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({
    headers: reqHeaders,
  });
  return session;
}

/**
 * Zwraca koszyk zalogowanego użytkownika z przeliczonymi cenami serwerowymi.
 */
export async function getMyCart(userId: string): Promise<CartView> {
  const cart = await prisma.cart.findUnique({
    where: { userId },
    include: {
      items: {
        include: {
          product: true,
        },
        orderBy: { id: "asc" },
      },
    },
  });

  if (!cart) {
    return {
      id: null,
      userId,
      items: [],
      totalPrice: 0,
      totalItems: 0,
    };
  }

  let totalPrice = 0;
  let totalItems = 0;

  const items: CartItemView[] = cart.items.map((item) => {
    const unitPrice = item.product.price;
    const lineTotal = unitPrice * item.quantity;
    totalPrice += lineTotal;
    totalItems += item.quantity;

    return {
      id: item.id,
      productId: item.productId,
      productCode: item.product.code,
      productName: item.product.name,
      productImage: item.product.image,
      unitPrice,
      quantity: item.quantity,
      lineTotal,
      availableStock: item.product.amount,
    };
  });

  return {
    id: cart.id,
    userId: cart.userId,
    items,
    totalPrice,
    totalItems,
  };
}

/**
 * Dodaje produkt do koszyka (lub zwiększa ilość).
 */
export async function addToCart(userId: string, productId: number, quantity: number = 1) {
  if (quantity < 1 || quantity > 99) {
    throw new Error("Ilość musi być w przedziale od 1 do 99");
  }

  return await prisma.$transaction(async (tx) => {
    // 1. Sprawdź produkt i dostępny stan
    const product = await tx.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new Error("Produkt nie został odnaleziony");
    }

    // 2. Znajdź lub utwórz koszyk użytkownika
    const cart = await tx.cart.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });

    // 3. Sprawdź czy pozycja już istnieje
    const existingItem = await tx.cartItem.findUnique({
      where: {
        cartId_productId: {
          cartId: cart.id,
          productId,
        },
      },
    });

    const newQuantity = existingItem ? existingItem.quantity + quantity : quantity;

    if (newQuantity > 99) {
      throw new Error("Maksymalna dopuszczalna ilość sztuk w koszyku to 99");
    }

    if (newQuantity > product.amount) {
      throw new Error(`Dostępna liczba sztuk w magazynie to tylko ${product.amount}`);
    }

    if (existingItem) {
      return await tx.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: newQuantity },
      });
    } else {
      return await tx.cartItem.create({
        data: {
          cartId: cart.id,
          productId,
          quantity: newQuantity,
        },
      });
    }
  });
}

/**
 * Zmienia ilość danej pozycji w koszyku z pełną autoryzacją właściciela (Zero-Trust).
 */
export async function updateCartItemQuantity(userId: string, itemId: number, quantity: number) {
  if (quantity < 0 || quantity > 99) {
    throw new Error("Ilość musi wynosić od 0 do 99");
  }

  return await prisma.$transaction(async (tx) => {
    // Zero-Trust: sprawdzamy itemId oraz czy cart.userId zgadza się z zalogowanym użytkownikiem
    const item = await tx.cartItem.findUnique({
      where: { id: itemId },
      include: {
        cart: true,
        product: true,
      },
    });

    if (!item || item.cart.userId !== userId) {
      throw new Error("Nie znaleziono pozycji w Twoim koszyku");
    }

    if (quantity === 0) {
      await tx.cartItem.delete({
        where: { id: itemId },
      });
      return null;
    }

    if (quantity > item.product.amount) {
      throw new Error(`Dostępna liczba sztuk w magazynie to tylko ${item.product.amount}`);
    }

    return await tx.cartItem.update({
      where: { id: itemId },
      data: { quantity },
    });
  });
}

/**
 * Usuwa pozycję z koszyka z pełną weryfikacją właściciela.
 */
export async function removeCartItem(userId: string, itemId: number) {
  return await prisma.$transaction(async (tx) => {
    const item = await tx.cartItem.findUnique({
      where: { id: itemId },
      include: { cart: true },
    });

    if (!item || item.cart.userId !== userId) {
      throw new Error("Nie znaleziono pozycji w Twoim koszyku");
    }

    await tx.cartItem.delete({
      where: { id: itemId },
    });

    return true;
  });
}

/**
 * Rozszerzenie 1: Transakcyjny Checkout z kluczem idempotencji,
 * atomową redukcją stanu magazynowego, snapshotem cen i czyszczeniem koszyka.
 */
export async function checkoutCart(userId: string, idempotencyKey?: string) {
  return await prisma.$transaction(async (tx) => {
    // 1. Sprawdź idempotencję (jeśli klucz został podany)
    if (idempotencyKey) {
      const existingOrder = await tx.order.findUnique({
        where: { idempotencyKey },
        include: { items: true },
      });
      if (existingOrder) {
        return {
          order: existingOrder,
          replayed: true,
        };
      }
    }

    // 2. Pobierz koszyk użytkownika z blokadą/świeżymi danymi produktów
    const cart = await tx.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: { product: true },
          orderBy: { id: "asc" },
        },
      },
    });

    if (!cart || cart.items.length === 0) {
      throw new Error("Twój koszyk jest pusty — dodaj produkty przed złożeniem zamówienia");
    }

    // 3. Sprawdź dostępność magazynową dla każdej pozycji
    for (const item of cart.items) {
      if (item.quantity > item.product.amount) {
        throw new Error(
          `Brak wystarczającej liczby sztuk produktu: ${item.product.name} (w magazynie: ${item.product.amount}, w koszyku: ${item.quantity})`
        );
      }
    }

    // 4. Atomowa redukcja stanów magazynowych
    for (const item of cart.items) {
      await tx.product.update({
        where: { id: item.productId },
        data: {
          amount: { decrement: item.quantity },
        },
      });
    }

    // 5. Oblicz sumę zamówienia w groszach
    const totalPrice = cart.items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

    // 6. Wygeneruj unikalny numer zamówienia
    const orderNumber = `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // 7. Utwórz zamówienie
    const order = await tx.order.create({
      data: {
        orderNumber,
        idempotencyKey: idempotencyKey || null,
        userId,
        status: "COMPLETED",
        totalPrice,
        items: {
          create: cart.items.map((item) => ({
            productId: item.productId,
            productName: item.product.name,
            productCode: item.product.code,
            quantity: item.quantity,
            unitPrice: item.product.price,
          })),
        },
      },
      include: {
        items: true,
      },
    });

    // 8. Opróżnij koszyk po udanym zakupie
    await tx.cartItem.deleteMany({
      where: { cartId: cart.id },
    });

    return {
      order,
      replayed: false,
    };
  });
}
