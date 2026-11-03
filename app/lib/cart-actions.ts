"use server";

import { revalidatePath } from "next/cache";
import { getSession, addToCart, updateCartItemQuantity, removeCartItem, checkoutCart } from "./cart";

export type CartActionResult<T = unknown> = {
  success: boolean;
  message?: string;
  data?: T;
};

/**
 * Server Action: Dodaje produkt do koszyka zalogowanego użytkownika.
 * Identyfikator użytkownika pobierany wyłącznie z bezpiecznej sesji serwera.
 */
export async function addToCartAction(productId: number, quantity: number = 1): Promise<CartActionResult> {
  try {
    const session = await getSession();
    if (!session || !session.user) {
      return { success: false, message: "Musisz być zalogowany, aby dodać produkt do koszyka." };
    }

    await addToCart(session.user.id, productId, quantity);
    revalidatePath("/basket");
    revalidatePath("/product-list");
    return { success: true, message: "Produkt został dodany do koszyka." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Wystąpił błąd podczas dodawania do koszyka.";
    return { success: false, message };
  }
}

/**
 * Server Action: Aktualizuje ilość pozycji w koszyku zalogowanego użytkownika.
 */
export async function updateQuantityAction(itemId: number, quantity: number): Promise<CartActionResult> {
  try {
    const session = await getSession();
    if (!session || !session.user) {
      return { success: false, message: "Brak aktywnej sesji logowania." };
    }

    await updateCartItemQuantity(session.user.id, itemId, quantity);
    revalidatePath("/basket");
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Błąd aktualizacji ilości pozycji.";
    return { success: false, message };
  }
}

/**
 * Server Action: Usuwa pozycję z koszyka zalogowanego użytkownika.
 */
export async function removeItemAction(itemId: number): Promise<CartActionResult> {
  try {
    const session = await getSession();
    if (!session || !session.user) {
      return { success: false, message: "Brak aktywnej sesji logowania." };
    }

    await removeCartItem(session.user.id, itemId);
    revalidatePath("/basket");
    return { success: true, message: "Pozycja została usunięta z koszyka." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Błąd usuwania pozycji.";
    return { success: false, message };
  }
}

/**
 * Server Action: Finalizuje zamówienie (Checkout) w bezpiecznej transakcji.
 */
export async function checkoutAction(idempotencyKey?: string): Promise<CartActionResult<{ orderNumber: string }>> {
  try {
    const session = await getSession();
    if (!session || !session.user) {
      return { success: false, message: "Zaloguj się, aby złożyć zamówienie." };
    }

    const result = await checkoutCart(session.user.id, idempotencyKey);
    revalidatePath("/basket");
    revalidatePath("/order-history");
    revalidatePath("/product-list");

    return {
      success: true,
      message: result.replayed
        ? `Zamówienie ${result.order.orderNumber} zostało już wcześniej złożone.`
        : `Zamówienie ${result.order.orderNumber} zostało pomyślnie złożone!`,
      data: { orderNumber: result.order.orderNumber },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się sfinalizować zamówienia.";
    return { success: false, message };
  }
}
