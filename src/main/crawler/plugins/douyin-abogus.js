function leftRotate(x, n) {
  n %= 32
  return ((x << n) | (x >>> (32 - n))) >>> 0
}

function getTj(j) {
  if (j >= 0 && j < 16) return 0x79cc4519
  if (j >= 16 && j < 64) return 0x7a879d8a
  throw new Error('invalid j')
}

function ff(j, x, y, z) {
  if (j < 16) return (x ^ y ^ z) >>> 0
  return ((x & y) | (x & z) | (y & z)) >>> 0
}

function gg(j, x, y, z) {
  if (j < 16) return (x ^ y ^ z) >>> 0
  return ((x & y) | (~x & z)) >>> 0
}

class SM3 {
  constructor() {
    this.reset()
  }

  reset() {
    this.reg = [
      1937774191,
      1226093241,
      388252375,
      3666478592,
      2842636476,
      372324522,
      3817729613,
      2969243214
    ]
    this.chunk = []
    this.size = 0
  }

  write(data) {
    const bytes =
      typeof data === 'string'
        ? Array.from(Buffer.from(data, 'utf8'))
        : Array.from(data)

    this.size += bytes.length
    this.chunk.push(...bytes)

    while (this.chunk.length >= 64) {
      this.compress(this.chunk.slice(0, 64))
      this.chunk = this.chunk.slice(64)
    }
  }

  fill() {
    const bitLength = this.size * 8

    this.chunk.push(0x80)

    while (this.chunk.length % 64 !== 56) {
      this.chunk.push(0)
    }

    const high = Math.floor(bitLength / 0x100000000)
    const low = bitLength >>> 0

    for (let i = 3; i >= 0; i--) {
      this.chunk.push((high >>> (i * 8)) & 0xff)
    }

    for (let i = 3; i >= 0; i--) {
      this.chunk.push((low >>> (i * 8)) & 0xff)
    }
  }

  compress(data) {
    const w = new Array(132).fill(0)

    for (let t = 0; t < 16; t++) {
      w[t] =
        (
          (data[4 * t] << 24) |
          (data[4 * t + 1] << 16) |
          (data[4 * t + 2] << 8) |
          data[4 * t + 3]
        ) >>> 0
    }

    for (let j = 16; j < 68; j++) {
      let a =
        (
          w[j - 16] ^
          w[j - 9] ^
          leftRotate(w[j - 3], 15)
        ) >>> 0

      a =
        (
          a ^
          leftRotate(a, 15) ^
          leftRotate(a, 23)
        ) >>> 0

      w[j] =
        (
          a ^
          leftRotate(w[j - 13], 7) ^
          w[j - 6]
        ) >>> 0
    }

    for (let j = 0; j < 64; j++) {
      w[j + 68] =
        (w[j] ^ w[j + 4]) >>> 0
    }

    let [
      a,
      b,
      c,
      d,
      e,
      f,
      g,
      h
    ] = this.reg

    for (let j = 0; j < 64; j++) {
      const ss1 = leftRotate(
        (
          leftRotate(a, 12) +
          e +
          leftRotate(getTj(j), j)
        ) >>> 0,
        7
      )

      const ss2 =
        ss1 ^ leftRotate(a, 12)

      const tt1 =
        (
          ff(j, a, b, c) +
          d +
          ss2 +
          w[j + 68]
        ) >>> 0

      const tt2 =
        (
          gg(j, e, f, g) +
          h +
          ss1 +
          w[j]
        ) >>> 0

      d = c
      c = leftRotate(b, 9)
      b = a
      a = tt1

      h = g
      g = leftRotate(f, 19)
      f = e

      e =
        (
          tt2 ^
          leftRotate(tt2, 9) ^
          leftRotate(tt2, 17)
        ) >>> 0
    }

    this.reg[0] ^= a
    this.reg[1] ^= b
    this.reg[2] ^= c
    this.reg[3] ^= d
    this.reg[4] ^= e
    this.reg[5] ^= f
    this.reg[6] ^= g
    this.reg[7] ^= h

    this.reg =
      this.reg.map((x) => x >>> 0)
  }

  sum(data) {
    this.reset()
    this.write(data)
    this.fill()

    for (
      let i = 0;
      i < this.chunk.length;
      i += 64
    ) {
      this.compress(
        this.chunk.slice(i, i + 64)
      )
    }

    const result = []

    for (const n of this.reg) {
      result.push(
        (n >>> 24) & 0xff,
        (n >>> 16) & 0xff,
        (n >>> 8) & 0xff,
        n & 0xff
      )
    }

    this.reset()

    return result
  }
}

function rc4Encrypt(input, key) {
  const s =
    Array.from(
      { length: 256 },
      (_, i) => i
    )

  let j = 0

  for (let i = 0; i < 256; i++) {
    j =
      (
        j +
        s[i] +
        key.charCodeAt(
          i % key.length
        )
      ) % 256

    ;[s[i], s[j]] =
      [s[j], s[i]]
  }

  let i = 0
  j = 0

  let out = ''

  for (let p = 0; p < input.length; p++) {
    i = (i + 1) % 256
    j = (j + s[i]) % 256

    ;[s[i], s[j]] =
      [s[j], s[i]]

    const t =
      (s[i] + s[j]) % 256

    out += String.fromCharCode(
      s[t] ^
      input.charCodeAt(p)
    )
  }

  return out
}

function getLongInt(round, text) {
  const offset = round * 3

  const a =
    offset < text.length
      ? text.charCodeAt(offset)
      : 0

  const b =
    offset + 1 < text.length
      ? text.charCodeAt(offset + 1)
      : 0

  const c =
    offset + 2 < text.length
      ? text.charCodeAt(offset + 2)
      : 0

  return (
    (a << 16) |
    (b << 8) |
    c
  )
}

function resultEncrypt(text, tableName) {
  const tables = {
    s3:
      'ckdp1h4ZKsUB80/Mfvw36XIgR25+WQAlEi7NLboqYTOPuzmFjJnryx9HVGDaStCe',
    s4:
      'Dkdpgh2ZmsQB80/MfvV36XI1R45-WUAlEixNLwoqYTOPuzKFjJnry79HbGcaStCe'
  }

  const masks = [
    16515072,
    258048,
    4032,
    63
  ]

  const shifts = [
    18,
    12,
    6,
    0
  ]

  const table =
    tables[tableName]

  let result = ''
  let round = 0
  let value =
    getLongInt(round, text)

  const total =
    Math.ceil(text.length / 3 * 4)

  for (let i = 0; i < total; i++) {
    if (
      Math.floor(i / 4) !== round
    ) {
      round += 1
      value =
        getLongInt(round, text)
    }

    const index =
      i % 4

    const charIndex =
      (
        value &
        masks[index]
      ) >>> shifts[index]

    result +=
      table[charIndex]
  }

  return result
}

function generRandom(
  randomNum,
  option
) {
  const byte1 =
    randomNum & 255

  const byte2 =
    (randomNum >>> 8) & 255

  return [
    (byte1 & 170) |
      (option[0] & 85),

    (byte1 & 85) |
      (option[0] & 170),

    (byte2 & 170) |
      (option[1] & 85),

    (byte2 & 85) |
      (option[1] & 170)
  ]
}

function generateRandomStr() {
  const values = [
    0.123456789,
    0.987654321,
    0.555555555
  ]

  const bytes = [
    ...generRandom(
      Math.floor(values[0] * 10000),
      [3, 45]
    ),
    ...generRandom(
      Math.floor(values[1] * 10000),
      [1, 0]
    ),
    ...generRandom(
      Math.floor(values[2] * 10000),
      [1, 5]
    )
  ]

  return String.fromCharCode(
    ...bytes
  )
}

function splitToBytes(num) {
  return [
    Math.floor(
      num / 0x1000000
    ) & 255,

    Math.floor(
      num / 0x10000
    ) & 255,

    Math.floor(
      num / 0x100
    ) & 255,

    num & 255
  ]
}

function generateRc4Body(
  params,
  userAgent
) {
  const suffix = 'cus'

  const sm3 = new SM3()

  const startTime =
    Date.now()

  const endTime =
    startTime + 100

  const p1 =
    sm3.sum(
      sm3.sum(
        Buffer.from(
          params + suffix,
          'utf8'
        )
      )
    )

  const p2 =
    sm3.sum(
      sm3.sum(
        Buffer.from(
          suffix,
          'utf8'
        )
      )
    )

  const uaKey =
    String.fromCharCode(
      0,
      1,
      14
    )

  const uaRc4 =
    rc4Encrypt(
      userAgent,
      uaKey
    )

  const uaEncoded =
    resultEncrypt(
      uaRc4,
      's3'
    )

  const ua =
    sm3.sum(uaEncoded)

  const startBytes =
    splitToBytes(startTime)

  const endBytes =
    splitToBytes(endTime)

  const b = {}

  b[18] = 44

  b[20] = startBytes[0]
  b[21] = startBytes[1]
  b[22] = startBytes[2]
  b[23] = startBytes[3]

  b[24] =
    Math.floor(
      startTime /
      0x100000000
    ) & 255

  b[25] =
    Math.floor(
      startTime /
      0x10000000000
    ) & 255

  b[26] = 0
  b[27] = 0
  b[28] = 0
  b[29] = 0

  b[30] = 0
  b[31] = 1

  b[32] = 0
  b[33] = 1

  b[34] = 0
  b[35] = 0
  b[36] = 0
  b[37] = 14

  b[38] = p1[21]
  b[39] = p1[22]

  b[40] = p2[21]
  b[41] = p2[22]

  b[42] = ua[23]
  b[43] = ua[24]

  b[44] = endBytes[0]
  b[45] = endBytes[1]
  b[46] = endBytes[2]
  b[47] = endBytes[3]

  b[48] = 3

  b[49] =
    Math.floor(
      endTime /
      0x100000000
    ) & 255

  b[50] =
    Math.floor(
      endTime /
      0x10000000000
    ) & 255

  const pageId = 110624

  const pageBytes =
    splitToBytes(pageId)

  b[52] = pageBytes[0]
  b[53] = pageBytes[1]
  b[54] = pageBytes[2]
  b[55] = pageBytes[3]

  const aid = 6383

  b[57] = aid & 255
  b[58] =
    (aid >>> 8) & 255
  b[59] =
    (aid >>> 16) & 255
  b[60] =
    (aid >>> 24) & 255

  const env =
    '1920|1080|1920|1040|0|30|0|0|1872|92|1920|1040|1857|92|1|24|Win32'

  const envBytes =
    Array.from(env)
      .map((c) =>
        c.charCodeAt(0)
      )

  b[65] =
    envBytes.length & 255

  b[66] =
    (
      envBytes.length >>> 8
    ) & 255

  b[70] = 0
  b[71] = 0

  b[72] =
    b[18] ^
    b[20] ^
    b[26] ^
    b[30] ^
    b[38] ^
    b[40] ^
    b[42] ^
    b[21] ^
    b[27] ^
    b[31] ^
    b[35] ^
    b[39] ^
    b[41] ^
    b[43] ^
    b[22] ^
    b[28] ^
    b[32] ^
    b[36] ^
    b[23] ^
    b[29] ^
    b[33] ^
    b[37] ^
    b[44] ^
    b[45] ^
    b[46] ^
    b[47] ^
    b[48] ^
    b[49] ^
    b[50] ^
    b[24] ^
    b[25] ^
    b[52] ^
    b[53] ^
    b[54] ^
    b[55] ^
    b[57] ^
    b[58] ^
    b[59] ^
    b[60] ^
    b[65] ^
    b[66] ^
    b[70] ^
    b[71]

  const body = [
    b[18],
    b[20],
    b[52],
    b[26],
    b[30],
    b[34],
    b[58],
    b[38],
    b[40],
    b[53],
    b[42],
    b[21],
    b[27],
    b[54],
    b[55],
    b[31],
    b[35],
    b[57],
    b[39],
    b[41],
    b[43],
    b[22],
    b[28],
    b[32],
    b[60],
    b[36],
    b[23],
    b[29],
    b[33],
    b[37],
    b[44],
    b[45],
    b[59],
    b[46],
    b[47],
    b[48],
    b[49],
    b[50],
    b[24],
    b[25],
    b[65],
    b[66],
    b[70],
    b[71],
    ...envBytes,
    b[72]
  ]

  return rc4Encrypt(
    String.fromCharCode(
      ...body
    ),
    String.fromCharCode(121)
  )
}

export function generateABogus(
  query,
  userAgent
) {
  return (
    resultEncrypt(
      generateRandomStr() +
        generateRc4Body(
          query,
          userAgent
        ),
      's4'
    ) + '='
  )
}
