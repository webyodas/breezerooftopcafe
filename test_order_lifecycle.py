import urllib.request
import json
import time

BASE_URL = 'https://breeze-2.pages.dev'

def api_call(endpoint, payload=None, method='POST'):
    req = urllib.request.Request(
        f'{BASE_URL}{endpoint}',
        data=json.dumps(payload).encode('utf-8') if payload else None,
        headers={
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        method=method
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode('utf-8'))

print('=== STARTING AUTOMATED TEST SUITE ===')

for cycle in range(1, 4):
    print(f'\n--- TEST CYCLE {cycle}/3 ---')
    order_id = f'BRZ-TEST-CYC{cycle}-{int(time.time())}'
    
    # 1. Customer places order
    order_data = {
        'id': order_id,
        'customer_name': 'Rajesh Suthar',
        'customer_phone': '9890332798',
        'customer_address': 'Flat 402, Sea Breeze Apts, Palghar West',
        'order_type': 'Home Delivery',
        'items': [{'name': 'Cold Brew Coffee', 'price': 150, 'qty': 1}, {'name': 'Avocado Toast', 'price': 200, 'qty': 1}],
        'subtotal': 350,
        'delivery_fee': 0,
        'total_amount': 350,
        'payment_method': 'cod',
        'payment_status': 'PENDING',
        'status': 'placed',
        'created_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    }
    res_insert = api_call('/api/query', {'action': 'insert', 'table': 'orders', 'data': order_data})
    assert res_insert.get('data'), f'Insert failed: {res_insert}'
    print(f'[PASS] 1. Placed Order #{order_id}')

    # 2. Verify Customer Rajesh past orders query
    cust_query = api_call('/api/query', {
        'action': 'select',
        'table': 'orders',
        'filters': [{'op': 'or', 'val': 'customer_phone.eq.9890332798,customer_phone.eq.+919890332798'}],
        'order': {'col': 'created_at', 'ascending': False}
    })
    orders_list = cust_query.get('data') or []
    found_cust = any(o['id'] == order_id for o in orders_list)
    assert found_cust, f'Order #{order_id} not found in customer query!'
    print(f'[PASS] 2. Customer Rajesh order list contains #{order_id} (Total customer orders: {len(orders_list)})')

    # 3. Admin accepts order
    now_iso = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    res_accept = api_call('/api/query', {
        'action': 'update',
        'table': 'orders',
        'data': {'status': 'confirmed', 'accepted_at': now_iso, 'estimated_prep_time': 20},
        'filters': [{'col': 'id', 'op': 'eq', 'val': order_id}]
    })
    assert res_accept.get('data'), 'Admin accept failed'
    print(f'[PASS] 3. Admin accepted order #{order_id}')

    # 4. Admin assigns rider RAJESH (test case-insensitive partner query as well)
    rider_partner = api_call('/api/query', {
        'action': 'select',
        'table': 'delivery_partners',
        'filters': [{'col': 'id', 'op': 'eq', 'val': 'rajesh'}] # lowercase test!
    })
    assert rider_partner.get('data') and len(rider_partner['data']) > 0, 'Rider rajesh lookup failed!'
    r_info = rider_partner['data'][0]
    print(f'[PASS] 4. Looked up rider partner case-insensitively (ID: {r_info["id"]}, Name: {r_info["name"]})')

    res_assign = api_call('/api/query', {
        'action': 'update',
        'table': 'orders',
        'data': {
            'rider_id': r_info['id'],
            'rider_name': r_info['name'],
            'rider_phone': r_info['phone'],
            'rider_assigned_at': now_iso
        },
        'filters': [{'col': 'id', 'op': 'eq', 'val': order_id}]
    })
    assert res_assign.get('data'), 'Rider assign failed'
    print(f'[PASS] 4b. Assigned rider #{r_info["id"]} to order')

    # 5. Rider picks up order
    res_pickup = api_call('/api/query', {
        'action': 'update',
        'table': 'orders',
        'data': {'status': 'preparing', 'picked_up_at': now_iso},
        'filters': [{'col': 'id', 'op': 'eq', 'val': order_id}]
    })
    assert res_pickup.get('data'), 'Rider pickup failed'
    print(f'[PASS] 5. Rider confirmed pickup from kitchen')

    # 6. Rider marks out for delivery
    res_out = api_call('/api/query', {
        'action': 'update',
        'table': 'orders',
        'data': {'status': 'out_for_delivery'},
        'filters': [{'col': 'id', 'op': 'eq', 'val': order_id}]
    })
    assert res_out.get('data'), 'Out for delivery update failed'
    print(f'[PASS] 6. Rider marked order out for delivery')

    # 7. Rider completes delivery (Cash collected = 350)
    deliv_time = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    res_deliv = api_call('/api/query', {
        'action': 'update',
        'table': 'orders',
        'data': {
            'status': 'delivered',
            'payment_status': 'PAID',
            'delivered_at': deliv_time,
            'cash_collected': 350,
            'settled_with_admin': 0
        },
        'filters': [{'col': 'id', 'op': 'eq', 'val': order_id}]
    })
    assert res_deliv.get('data'), 'Delivery completion update failed'
    
    # Update rider partner cash_in_hand
    prev_cash = float(r_info.get('cash_in_hand') or 0)
    new_cash = prev_cash + 350
    api_call('/api/query', {
        'action': 'update',
        'table': 'delivery_partners',
        'data': {'cash_in_hand': new_cash, 'total_deliveries': (r_info.get('total_deliveries') or 0) + 1},
        'filters': [{'col': 'id', 'op': 'eq', 'val': 'RAJESH'}]
    })
    print(f'[PASS] 7. Rider completed delivery & updated cash in hand to Rs {new_cash}')

    # 8. VERIFY Rider Rajesh completed orders list returns the order!
    rider_completed = api_call('/api/query', {
        'action': 'select',
        'table': 'orders',
        'filters': [
            {'col': 'rider_id', 'op': 'ilike', 'val': 'rajesh'},
            {'col': 'status', 'op': 'ilike', 'val': 'delivered'}
        ],
        'order': {'col': 'created_at', 'ascending': False},
        'limit': 50
    })
    r_orders = rider_completed.get('data') or []
    found_rider_order = any(o['id'] == order_id for o in r_orders)
    assert found_rider_order, f'Delivered order #{order_id} NOT found in rider Rajesh completed orders!'
    print(f'[PASS] 8. VERIFIED: Order #{order_id} appears in Rider Rajesh completed list! (Count: {len(r_orders)})')

    # 9. Admin settles cash due
    res_settle = api_call('/api/query', {
        'action': 'update',
        'table': 'orders',
        'data': {'settled_with_admin': 1, 'settled_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())},
        'filters': [{'col': 'id', 'op': 'eq', 'val': order_id}]
    })
    assert res_settle.get('data'), 'Admin settlement failed'
    api_call('/api/query', {
        'action': 'update',
        'table': 'delivery_partners',
        'data': {'cash_in_hand': 0},
        'filters': [{'col': 'id', 'op': 'eq', 'val': 'RAJESH'}]
    })
    print(f'[PASS] 9. Admin settled order #{order_id} and cleared cash due')

    # 10. Re-verify order STILL appears in rider completed list after settlement!
    rider_after_settle = api_call('/api/query', {
        'action': 'select',
        'table': 'orders',
        'filters': [
            {'col': 'rider_id', 'op': 'ilike', 'val': 'rajesh'},
            {'col': 'status', 'op': 'ilike', 'val': 'delivered'}
        ],
        'order': {'col': 'created_at', 'ascending': False},
        'limit': 50
    })
    still_there = any(o['id'] == order_id for o in (rider_after_settle.get('data') or []))
    assert still_there, f'Order vanished from rider list after admin settlement!'
    print(f'[PASS] 10. VERIFIED: Order #{order_id} STILL appears in Rider Rajesh list after settlement!')

# 11. Table Reservation Lifecycle Test
print('\n--- TESTING TABLE RESERVATION LIFECYCLE ---')
resv_id = f'RESV-{int(time.time())}'
resv_data = {
    'id': resv_id,
    'guest_name': 'Rajesh Suthar',
    'guest_phone': '9890332798',
    'guest_count': 4,
    'reservation_date': '2026-10-25',
    'time_slot': '19:30',
    'seating_zone': 'Starlight Rooftop',
    'special_notes': 'Sunset view table please',
    'status': 'pending',
    'created_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
}
api_call('/api/query', {'action': 'insert', 'table': 'table_reservations', 'data': resv_data})
resv_chk = api_call('/api/query', {'action': 'select', 'table': 'table_reservations', 'filters': [{'col': 'id', 'op': 'eq', 'val': resv_id}]})
assert resv_chk.get('data'), 'Reservation creation failed'
print(f'[PASS] Created Table Reservation #{resv_id}')

api_call('/api/query', {'action': 'update', 'table': 'table_reservations', 'data': {'status': 'confirmed'}, 'filters': [{'col': 'id', 'op': 'eq', 'val': resv_id}]})
resv_conf = api_call('/api/query', {'action': 'select', 'table': 'table_reservations', 'filters': [{'col': 'id', 'op': 'eq', 'val': resv_id}]})
assert resv_conf.get('data')[0]['status'] == 'confirmed', 'Reservation confirmation failed'
print(f'[PASS] Confirmed Table Reservation #{resv_id}')

# 12. Menu Items Inventory & Price Update Test
print('\n--- TESTING MENU STOCK & PRICE EDIT LIFECYCLE ---')
menu_q = api_call('/api/query', {'action': 'select', 'table': 'menu_items', 'limit': 1})
first_item = menu_q['data'][0]
orig_price = first_item['price']
test_price = orig_price + 10

api_call('/api/query', {'action': 'update', 'table': 'menu_items', 'data': {'price': test_price}, 'filters': [{'col': 'id', 'op': 'eq', 'val': first_item['id']}]})
menu_updated = api_call('/api/query', {'action': 'select', 'table': 'menu_items', 'filters': [{'col': 'id', 'op': 'eq', 'val': first_item['id']}]})
assert menu_updated['data'][0]['price'] == test_price, 'Menu price update failed'
print(f'[PASS] Updated dish "{first_item["name"]}" price from Rs {orig_price} -> Rs {test_price}')

# Revert price back
api_call('/api/query', {'action': 'update', 'table': 'menu_items', 'data': {'price': orig_price}, 'filters': [{'col': 'id', 'op': 'eq', 'val': first_item['id']}]})
menu_reverted = api_call('/api/query', {'action': 'select', 'table': 'menu_items', 'filters': [{'col': 'id', 'op': 'eq', 'val': first_item['id']}]})
assert menu_reverted['data'][0]['price'] == orig_price, 'Menu price revert failed'
print(f'[PASS] Reverted dish "{first_item["name"]}" price back to Rs {orig_price}')

# 13. Realtime Events Stream Test
print('\n--- TESTING REALTIME EVENTS POLLER (/api/events) ---')
ev_res = api_call('/api/events?since=0', method='GET')
events = ev_res.get('events') or []
assert len(events) > 0, 'No realtime events captured!'
last_id = ev_res.get('lastId')
print(f'[PASS] Realtime Events engine operational (Captured {len(events)} events, latest event ID: {last_id})')

print('\n=== ALL AUTOMATED TESTS COMPLETED WITH 100% SUCCESS! ===')
