import test from 'node:test';import assert from 'node:assert/strict';import{priceMeasurement}from'../src/chart-measurement.mjs';
const a={t:0,price:100},b={t:86400000*5,price:125};
test('forward drag measures return and elapsed time',()=>{const m=priceMeasurement(a,b);assert.equal(m.percent,25);assert.equal(m.delta,25);assert.equal(m.days,5)});
test('reverse drag uses the point clicked first as its baseline',()=>{const m=priceMeasurement(b,a);assert.ok(Math.abs(m.percent+20)<1e-10);assert.equal(m.delta,-25);assert.equal(m.days,5)});
test('same point and flat prices measure zero',()=>{assert.equal(priceMeasurement(a,a).percent,0);assert.equal(priceMeasurement(a,{...b,price:100}).percent,0)});
test('invalid data and zero baseline never produce infinite measurements',()=>{for(const p of [null,{t:0,price:0},{t:0,price:NaN},{t:NaN,price:100}])assert.equal(priceMeasurement(p,b),null)});
