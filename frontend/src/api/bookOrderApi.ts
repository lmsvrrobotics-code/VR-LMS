import axios from "axios";

const BASE = (import.meta.env.VITE_ADMIN_API_URL as string) || "http://localhost:5000";

const api = axios.create({ baseURL: `${BASE}/api/public`, timeout: 20000 });
api.interceptors.request.use((config) => {
  const id = localStorage.getItem("userId");
  if (id) config.headers.set("x-user-id", String(id));
  const token = localStorage.getItem("accessToken");
  if (token) config.headers.set("Authorization", `Bearer ${token}`);
  return config;
});

type OrderResp = {
  order_id?: string;
  amount?: number;
  currency?: string;
  key_id?: string;
  alreadyPaid?: boolean;
  message?: string;
  book?: { id: number; title: string };
  kit?: { id: number; title: string };
};

export const createBookOrder = (bookId: number) =>
  api.post("/books-orders/order", { book_id: bookId }).then((r) => r.data as OrderResp);

export const createKitOrder = (kitId: number) =>
  api.post("/kits-orders/order", { kit_id: kitId }).then((r) => r.data as OrderResp);

export const verifyBookPayment = (payload: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}) => api.post("/books-orders/verify", payload).then((r) => r.data as { success: boolean; message: string });

export const verifyKitPayment = (payload: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}) => api.post("/kits-orders/verify", payload).then((r) => r.data as { success: boolean; message: string });

const loadRazorpay = () =>
  new Promise<boolean>((resolve) => {
    if ((window as unknown as { Razorpay?: unknown }).Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });

export async function buyBook(
  bookId: number,
  buyer: { name?: string; email?: string; phone?: string },
  onSuccess: () => void,
  onError?: (msg: string) => void,
): Promise<void> {
  try {
    const order = await createBookOrder(bookId);
    if (order.alreadyPaid) { onSuccess(); return; }
    if (!order.order_id || !order.key_id) {
      onError?.(order.message || "Payment could not be started.");
      return;
    }
    const ok = await loadRazorpay();
    if (!ok) { onError?.("Could not load the payment window."); return; }

    const Razorpay = (window as unknown as { Razorpay: new (o: unknown) => { open: () => void } }).Razorpay;
    const rzp = new Razorpay({
      key: order.key_id,
      amount: order.amount,
      currency: order.currency || "INR",
      name: "VR Robotics Academy",
      description: order.book?.title || "Book purchase",
      order_id: order.order_id,
      prefill: { name: buyer.name, email: buyer.email, contact: buyer.phone },
      theme: { color: "#FF6A00" },
      handler: async (resp: {
        razorpay_order_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
      }) => {
        try {
          const v = await verifyBookPayment(resp);
          if (v.success) onSuccess();
          else onError?.(v.message || "Payment verification failed.");
        } catch {
          onError?.("Payment succeeded but verification failed — contact support.");
        }
      },
    });
    rzp.open();
  } catch (e: unknown) {
    const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || "Payment failed.";
    onError?.(msg);
  }
}

export async function buyKit(
  kitId: number,
  buyer: { name?: string; email?: string; phone?: string },
  onSuccess: () => void,
  onError?: (msg: string) => void,
): Promise<void> {
  try {
    const order = await createKitOrder(kitId);
    if (order.alreadyPaid) { onSuccess(); return; }
    if (!order.order_id || !order.key_id) {
      onError?.(order.message || "Payment could not be started.");
      return;
    }
    const ok = await loadRazorpay();
    if (!ok) { onError?.("Could not load the payment window."); return; }

    const Razorpay = (window as unknown as { Razorpay: new (o: unknown) => { open: () => void } }).Razorpay;
    const rzp = new Razorpay({
      key: order.key_id,
      amount: order.amount,
      currency: order.currency || "INR",
      name: "VR Robotics Academy",
      description: order.kit?.title || "Kit purchase",
      order_id: order.order_id,
      prefill: { name: buyer.name, email: buyer.email, contact: buyer.phone },
      theme: { color: "#FF6A00" },
      handler: async (resp: {
        razorpay_order_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
      }) => {
        try {
          const v = await verifyKitPayment(resp);
          if (v.success) onSuccess();
          else onError?.(v.message || "Payment verification failed.");
        } catch {
          onError?.("Payment succeeded but verification failed — contact support.");
        }
      },
    });
    rzp.open();
  } catch (e: unknown) {
    const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || "Payment failed.";
    onError?.(msg);
  }
}
