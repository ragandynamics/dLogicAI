// Support legacy and item-level Stripe periods without inventing mixed-interval dates.
export function subscriptionPeriod(subscription: any) {
  const milliseconds = (value: unknown): number | null => {
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) && seconds > 0 && Number.isSafeInteger(seconds * 1000)
      ? seconds * 1000 : null;
  };
  function field(name: string): number | null {
    const legacy = milliseconds(subscription[name]);
    if (legacy !== null) return legacy;
    const items = subscription.items?.data;
    if (!Array.isArray(items) || !items.length || subscription.items?.has_more) return null;
    const values = items.map((item: any) => milliseconds(item[name]));
    return values.every(value => value !== null && value === values[0]) ? values[0] : null;
  }
  return { start: field("current_period_start"), end: field("current_period_end"), trialEnd: milliseconds(subscription.trial_end) };
}
