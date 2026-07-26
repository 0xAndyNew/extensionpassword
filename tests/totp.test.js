import test from 'node:test'; import assert from 'node:assert/strict';
import { generateTotp, parseOtpAuthUri, parseAuthenticatorText, serializeAuthenticatorText } from '../src/vault/totp.js';
test('RFC 6238 SHA1 vector', async()=>{assert.equal(await generateTotp({secret:'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',algorithm:'SHA1',digits:8,period:30},59000),'94287082');});
test('parses and serializes authenticator text in order',()=>{const text='otpauth://totp/GitHub:user?secret=JBSWY3DPEHPK3PXP&issuer=GitHub\ninvalid';const parsed=parseAuthenticatorText(text);assert.equal(parsed.records.length,1);assert.equal(parsed.errors[0].row,2);assert.equal(parseOtpAuthUri(serializeAuthenticatorText(parsed.records)).account,'user');});
