// Tags what an automation just saved with where the phone is (README:
// Transaction locations > Automations): an Apple Pay tap, a payment alert or a
// screenshot the app saw moments after it happened. Renders nothing.

import { useEffect, useRef } from 'react';

import { useApp } from '~/context/AppContext';
import { I18n } from '~/lib/i18n';
import { transactionsRepository } from '~/lib/repositories/transactionsRepository';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { reportError } from '~/services/errorReporting';

import {
  type AutomationTagRequest,
  shouldAutomationTag,
  subscribeAutomationTag,
  takeAutomationTagRequests,
} from '../lib/automationTag';
import { isLocatedTransaction, toTransactionLocation } from '../lib/placeLocation';
import { locateCurrentPlace } from '../services/currentPlace';
import { getLocationPermission } from '../services/deviceLocation';

export function AutomationTagHost() {
  const { settings, updateTransactionsBulk } = useApp();
  const stateRef = useRef({ settings, updateTransactionsBulk });
  stateRef.current = { settings, updateTransactionsBulk };

  useEffect(() => {
    let running = false;
    let rerun = false;
    let unmounted = false;

    const eligible = (request: AutomationTagRequest) => {
      const row = transactionsRepository.getById(request.transactionId);
      if (!row) return false;
      const { settings: live } = stateRef.current;
      return shouldAutomationTag(
        {
          type: row.type,
          date: row.date,
          located: isLocatedTransaction(row),
          deleted: row.deletedAt != null,
        },
        request.occurredAt,
        {
          locationsEnabled: live.transactionLocationsEnabled,
          autoTag: live.transactionLocationAutoTag,
        },
      );
    };

    const runOnce = async () => {
      const requests = takeAutomationTagRequests().filter(eligible);
      if (requests.length === 0) return;
      // Never asks: an automation is no moment for a system dialog. Without
      // access the entries stay as they were saved.
      const permission = await getLocationPermission();
      if (permission.status !== 'granted') return;
      let place;
      try {
        ({ place } = await locateCurrentPlace({
          appUserId: stateRef.current.settings.appUserId,
          locale: I18n.locale,
          isCancelled: () => unmounted,
        }));
      } catch {
        // No fix this time (Location Services off, indoors): no tag.
        return;
      }
      if (unmounted) return;
      const location = toTransactionLocation(place);
      for (const request of requests) {
        // Checked again: the user may have opened it and picked a place, or
        // deleted it, while the phone was finding the spot.
        if (!eligible(request)) continue;
        stateRef.current.updateTransactionsBulk([{ id: request.transactionId, input: location }], {
          // Counted once the place is stored, like the editor's.
          afterWrite: (stored) => {
            if (stored) {
              void trackEvent(AnalyticsEvents.TRANSACTION_LOCATION_SET, { source: 'automation' });
            }
          },
        });
      }
    };

    const run = async () => {
      if (running) {
        rerun = true;
        return;
      }
      running = true;
      try {
        do {
          rerun = false;
          try {
            await runOnce();
          } catch (error) {
            // A failed pass loses only its own tags; the next request still runs.
            reportError(error, { scope: 'automation_location_tag' });
          }
        } while (rerun && !unmounted);
      } finally {
        running = false;
      }
    };

    const unsubscribe = subscribeAutomationTag(() => void run());
    // Anything saved before this mounted.
    void run();
    return () => {
      unmounted = true;
      unsubscribe();
    };
  }, []);

  return null;
}
