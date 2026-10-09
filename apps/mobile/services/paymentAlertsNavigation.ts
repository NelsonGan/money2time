/** Open Android payment-alert setup from the settings stack. */
export type PaymentAlertsScreenRequest =
  | { screen: 'PaymentAlertsSetup'; step?: 'apps' }
  | { screen: 'NotificationHistory' };

type Listener = (request: PaymentAlertsScreenRequest) => void;

const listeners = new Set<Listener>();

export function requestOpenPaymentAlerts(request: PaymentAlertsScreenRequest) {
  listeners.forEach((listener) => listener(request));
}

export function subscribeOpenPaymentAlerts(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
