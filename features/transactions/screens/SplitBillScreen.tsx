import { type RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';

import { useSplitBillSession } from '~/context/SplitBillSession';
import { SplitBillModal } from '~/features/transactions/components/editor';
import type { RootStackParamList } from '~/navigation/rootStack';

/**
 * Standard navigation page for the split-bill editor. It renders the shared
 * SplitBillModal body in page mode against the live session the transaction
 * editor published, and maps Done / Cancel (including the swipe-back gesture)
 * back onto the editor's commit / discard callbacks.
 */
export function SplitBillScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'SplitBill'>>();
  const session = useSplitBillSession();
  const doneRef = useRef(false);
  // Once a session has arrived, a later null is just the editor tearing down as
  // we pop — don't treat it as an orphaned mount and pop again.
  const hadSessionRef = useRef(false);
  if (session) hadSessionRef.current = true;
  // The editor republishes a fresh session object on every split edit; hold it
  // in a ref so the beforeRemove listener reads the latest onCancel without
  // re-subscribing (and tearing down) on every keystroke.
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // Any removal that wasn't an explicit Done is a cancel — covers the header
  // back button and the edge-swipe-back gesture alike.
  useEffect(
    () =>
      navigation.addListener('beforeRemove', () => {
        if (!doneRef.current) sessionRef.current?.onCancel();
      }),
    [navigation],
  );

  // Guard only the genuinely-orphaned case: navigated here with no session that
  // never populates. The normal teardown (session -> null after we pop) is
  // ignored via hadSessionRef.
  useEffect(() => {
    if (!session && !hadSessionRef.current) navigation.goBack();
  }, [session, navigation]);

  const handleDone = useCallback(() => {
    doneRef.current = true;
    session?.onDone();
    navigation.goBack();
  }, [navigation, session]);

  const handleCancel = useCallback(() => {
    // beforeRemove runs the editor's onCancel.
    navigation.goBack();
  }, [navigation]);

  if (!session) return <View className="flex-1 bg-background" />;

  return (
    <SplitBillModal
      presentation="page"
      visible
      initialToast={route.params?.toast}
      total={session.total}
      itemized={session.itemized}
      assignItems={session.assignItems}
      defaultAccountId={session.defaultAccountId}
      splits={session.splits}
      onChange={session.onChange}
      splitEvenly={session.splitEvenly}
      onSplitEvenlyChange={session.onSplitEvenlyChange}
      accounts={session.accounts}
      accountGroups={session.accountGroups}
      currencySymbol={session.currencySymbol}
      formatSettings={session.formatSettings}
      onMarkPaid={session.onMarkPaid}
      onMarkUnpaid={session.onMarkUnpaid}
      newlyPaidIds={session.newlyPaidIds}
      onDone={handleDone}
      onCancel={handleCancel}
    />
  );
}
