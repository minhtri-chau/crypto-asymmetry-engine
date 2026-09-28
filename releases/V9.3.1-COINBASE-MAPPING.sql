-- v9.3.1 verified Coinbase product mappings for the current research assets.
-- Checked 2026-09-28 against api.exchange.coinbase.com/products (USD product online, trading enabled) and
-- /currencies (Coinbase currency name matches the asset). Each update also matches coingecko_id, so it cannot
-- attach a product to a different asset that happens to share the ticker.
update public.research_assets set coinbase_product_id='AAVE-USD' where symbol='AAVE' and coingecko_id='aave';
update public.research_assets set coinbase_product_id='PENDLE-USD' where symbol='PENDLE' and coingecko_id='pendle';
update public.research_assets set coinbase_product_id='AERO-USD' where symbol='AERO' and coingecko_id='aerodrome-finance';
update public.research_assets set coinbase_product_id='AKT-USD' where symbol='AKT' and coingecko_id='akash-network';
update public.research_assets set coinbase_product_id='LINK-USD' where symbol='LINK' and coingecko_id='chainlink';
update public.research_assets set coinbase_product_id='TAO-USD' where symbol='TAO' and coingecko_id='bittensor';
update public.research_assets set coinbase_product_id='ONDO-USD' where symbol='ONDO' and coingecko_id='ondo-finance';
update public.research_assets set coinbase_product_id='TIA-USD' where symbol='TIA' and coingecko_id='celestia';
update public.research_assets set coinbase_product_id='SUI-USD' where symbol='SUI' and coingecko_id='sui';
update public.research_assets set coinbase_product_id='PUMP-USD' where symbol='PUMP' and coingecko_id='pump-fun';
