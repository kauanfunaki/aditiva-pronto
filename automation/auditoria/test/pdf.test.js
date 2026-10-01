'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { analisarPdfBuffer, MARCA_ICP_HEX } = require('../src/pdf');

test('PDF sem ByteRange não é assinado', () => {
  assert.deepEqual(analisarPdfBuffer(Buffer.from('%PDF-1.7 arquivo comum')), {
    assinado: false,
    marca: null,
  });
});

test('detecta assinatura digital sem presumir ICP-Brasil', () => {
  assert.deepEqual(analisarPdfBuffer(Buffer.from('%PDF /ByteRange [0 10 20 30]')), {
    assinado: true,
    marca: null,
  });
});

test('detecta ICP-Brasil literal e hexadecimal somente em PDF assinado', () => {
  assert.deepEqual(analisarPdfBuffer(Buffer.from('/ByteRange ICP-Brasil')), {
    assinado: true,
    marca: 'icp',
  });
  assert.deepEqual(analisarPdfBuffer(Buffer.from(`/ByteRange ${MARCA_ICP_HEX.toUpperCase()}`)), {
    assinado: true,
    marca: 'icp',
  });
  assert.deepEqual(analisarPdfBuffer(Buffer.from(MARCA_ICP_HEX)), {
    assinado: false,
    marca: null,
  });
});
