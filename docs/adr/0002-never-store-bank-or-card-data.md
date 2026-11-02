# Never store bank or card data

Payments run through Stripe (Checkout / Payment Element) and any future bank sync through a provider such as Plaid. The app stores only provider IDs and tokens, never account, routing, or card numbers, keeping it out of PCI scope and limiting the damage of a database leak.
