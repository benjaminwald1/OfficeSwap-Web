// GET /api/billing — sends an organization's owner to Stripe's customer
// portal (they sign in with the email they subscribed with) to change plan,
// update the card, see invoices or cancel.

// Stripe's customer portal login link (not secret). A Cloudflare setting wins.
const PORTAL_LOGIN_URL = "https://billing.stripe.com/p/login/9B63cw4ml8IM5yi1IedfG00";

export async function onRequestGet({ env }) {
  const url = env.STRIPE_PORTAL_LOGIN_URL || PORTAL_LOGIN_URL;
  if (!url || !/^https:\/\/billing\.stripe\.com\//.test(url)) {
    return Response.redirect("https://officeswap.co/support/", 302);
  }
  return Response.redirect(url, 302);
}
