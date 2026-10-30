import urllib.request
import json
import time
import hmac
import hashlib
import base64

BASE_URL = 'https://breezerooftopcafe.pages.dev'
DEFAULT_AUTH_SECRET = 'breeze-cafe-edge-secret-2026-auth-token-key-palghar-webyodas'

def create_jwt(role='admin'):
    header = {'alg': 'HS256', 'typ': 'JWT'}
    payload = {
        'sub': role,
        'role': role,
        'type': role,
        'id': 'test_admin_user',
        'exp': int(time.time()) + 3600
    }
    def b64url(b):
        return base64.urlsafe_b64encode(b).decode('utf-8').rstrip('=')
    
    enc_header = b64url(json.dumps(header).encode('utf-8'))
    enc_payload = b64url(json.dumps(payload).encode('utf-8'))
    data = f'{enc_header}.{enc_payload}'.encode('utf-8')
    sig = hmac.new(DEFAULT_AUTH_SECRET.encode('utf-8'), data, hashlib.sha256).digest()
    return f'{enc_header}.{enc_payload}.{b64url(sig)}'

ADMIN_TOKEN = create_jwt('admin')

def api_call(endpoint, payload=None, method='POST', token=ADMIN_TOKEN):
    headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TestSuite/1.0'
    }
    if token:
        headers['Authorization'] = f'Bearer {token}'
    req = urllib.request.Request(
        f'{BASE_URL}{endpoint}',
        data=json.dumps(payload).encode('utf-8') if payload else None,
        headers=headers,
        method=method
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode('utf-8'))

print('================================================================')
print('RUNNING DEEP VERIFICATION TEST FOR STATUS MONOTONICITY & SYNC')
print('================================================================')

order_id = f'BRZ-MONO-{int(time.time())}'
now_iso = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())

print(f'\n1. Creating test order #{order_id} with status "placed"...')
order_data = {
    'id': order_id,
    'customer_name': 'Monotonicity Test Customer',
    'customer_phone': '9999999999',
    'customer_address': 'Testing Lane, Unit 1',
    'order_type': 'Home Delivery',
    'items': [{'name': 'Hot Espresso', 'price': 120, 'qty': 1}],
    'subtotal': 120,
    'delivery_fee': 0,
    'total_amount': 120,
    'payment_method': 'cod',
    'payment_status': 'PENDING',
    'status': 'placed',
    'created_at': now_iso
}
res_insert = api_call('/api/query', {'action': 'insert', 'table': 'orders', 'data': order_data})
assert res_insert.get('data'), f'Insert failed: {res_insert}'
print('  --> Order created successfully.')

def get_order_status():
    res = api_call('/api/query', {
        'action': 'select',
        'table': 'orders',
        'filters': [{'col': 'id', 'op': 'eq', 'val': order_id}]
    })
    orders = res.get('data') or []
    assert len(orders) > 0, f'Order {order_id} not found in DB!'
    return orders[0]['status'], orders[0]

st, ord_obj = get_order_status()
assert st == 'placed', f'Expected placed, got {st}'
print(f'  --> Verified DB status: "{st}" [Rank: placed]')

print('\n2. Admin confirms order (placed -> confirmed)...')
api_call('/api/query', {
    'action': 'update',
    'table': 'orders',
    'data': {'status': 'confirmed', 'accepted_at': now_iso},
    'filters': [{'col': 'id', 'op': 'eq', 'val': order_id}]
})
st, _ = get_order_status()
assert st == 'confirmed', f'Expected confirmed, got {st}'
print(f'  --> Verified DB status: "{st}" [Rank: confirmed]')

print('\n3. Kitchen marks food ready (confirmed -> food_ready)...')
api_call('/api/query', {
    'action': 'update',
    'table': 'orders',
    'data': {'status': 'food_ready'},
    'filters': [{'col': 'id', 'op': 'eq', 'val': order_id}]
})
st, _ = get_order_status()
assert st == 'food_ready', f'Expected food_ready, got {st}'
print(f'  --> Verified DB status: "{st}" [Rank: food_ready]')

print('\n4. REGRESSION ATTACK TEST 1: Attempting to regress food_ready -> preparing...')
res_attack1 = api_call('/api/query', {
    'action': 'update',
    'table': 'orders',
    'data': {'status': 'preparing'},
    'filters': [{'col': 'id', 'op': 'eq', 'val': order_id}]
})
st, _ = get_order_status()
print(f'  --> Query Response: {res_attack1}')
print(f'  --> Current DB status after attack: "{st}"')
assert st == 'food_ready', f'FAILED! Status regressed to {st} instead of staying food_ready!'
print('  --> [PASS] Monotonic protection blocked regression to "preparing"!')

print('\n5. REGRESSION ATTACK TEST 2: Attempting to regress food_ready -> placed...')
api_call('/api/query', {
    'action': 'update',
    'table': 'orders',
    'data': {'status': 'placed'},
    'filters': [{'col': 'id', 'op': 'eq', 'val': order_id}]
})
st, _ = get_order_status()
assert st == 'food_ready', f'FAILED! Status regressed to {st} instead of staying food_ready!'
print('  --> [PASS] Monotonic protection blocked regression to "placed"!')

print('\n6. Rider picks up order (food_ready -> out_for_delivery)...')
pickup_time = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
api_call('/api/query', {
    'action': 'update',
    'table': 'orders',
    'data': {
        'status': 'out_for_delivery',
        'picked_up_at': pickup_time,
        'dispatched_at': pickup_time,
        'rider_id': 'RAJESH',
        'rider_name': 'Rajesh Rider'
    },
    'filters': [{'col': 'id', 'op': 'eq', 'val': order_id}]
})
st, ord_obj = get_order_status()
assert st == 'out_for_delivery', f'Expected out_for_delivery, got {st}'
assert ord_obj.get('picked_up_at'), 'picked_up_at timestamp missing!'
print(f'  --> Verified DB status: "{st}" [Rank: out_for_delivery]')
print(f'  --> Verified picked_up_at: {ord_obj.get("picked_up_at")}')

print('\n7. REGRESSION ATTACK TEST 3: Attempting to regress out_for_delivery -> food_ready...')
res_attack3 = api_call('/api/query', {
    'action': 'update',
    'table': 'orders',
    'data': {'status': 'food_ready'},
    'filters': [{'col': 'id', 'op': 'eq', 'val': order_id}]
})
st, _ = get_order_status()
assert st == 'out_for_delivery', f'FAILED! Status regressed to {st} instead of staying out_for_delivery!'
print('  --> [PASS] Monotonic protection blocked regression to "food_ready"!')

print('\n8. Rider completes delivery (out_for_delivery -> delivered)...')
deliv_time = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
api_call('/api/query', {
    'action': 'update',
    'table': 'orders',
    'data': {
        'status': 'delivered',
        'payment_status': 'PAID',
        'delivered_at': deliv_time,
        'cash_collected': 120,
        'settled_with_admin': 0
    },
    'filters': [{'col': 'id', 'op': 'eq', 'val': order_id}]
})
st, ord_obj = get_order_status()
assert st == 'delivered', f'Expected delivered, got {st}'
assert ord_obj.get('delivered_at'), 'delivered_at timestamp missing!'
print(f'  --> Verified DB status: "{st}" [Rank: delivered]')

print('\n9. REGRESSION ATTACK TEST 4: Attempting to regress delivered -> out_for_delivery...')
api_call('/api/query', {
    'action': 'update',
    'table': 'orders',
    'data': {'status': 'out_for_delivery'},
    'filters': [{'col': 'id', 'op': 'eq', 'val': order_id}]
})
st, _ = get_order_status()
assert st == 'delivered', f'FAILED! Status regressed to {st} instead of staying delivered!'
print('  --> [PASS] Monotonic protection blocked regression to "out_for_delivery"!')

print('\n================================================================')
print('ALL MONOTONICITY & LIFECYCLE TESTS PASSED WITH 100% SUCCESS!')
print('================================================================')
