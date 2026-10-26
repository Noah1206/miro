/** Audible tone fixture for transport/billing tests; never presented as a model voice. */
export function testWav(seconds=.25) {
  const rate=16000,count=Math.round(rate*seconds),b=Buffer.alloc(44+count*2)
  b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16)
  b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28)
  b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(count*2,40)
  for(let n=0;n<count;n++)b.writeInt16LE(Math.round(Math.sin(2*Math.PI*220*n/rate)*5000),44+n*2)
  return new Uint8Array(b).buffer
}
