// GET /api/billing — sends an organization's owner to Stripe's customer
// portal (they sign in with the email they subscribed with) to change plan,
// update the card, see invoices or cancel.

export async function onRequestGet({ env }) {
  const url = env.STRIPE_PORTAL_LOGIN_URL;
  if (!url || !/^https:\/\/billing\.stripe\.com\//.test(url)) {
    return Response.redirect("https://officeswap.co/support/", 302);
  }
  return Response.redirect(url, 302);
}
