import struct
import zlib


class Proto:
    def __init__(self):
        self.packetLen = 0
        self.headerLen = 16
        self.ver = 0
        self.op = 0
        self.seq = 0
        self.body = ''
        self.maxBody = 10 * 1024 * 1024

    def pack(self):
        self.packetLen = len(self.body) + self.headerLen
        buf = struct.pack('>i', self.packetLen)
        buf += struct.pack('>h', self.headerLen)
        buf += struct.pack('>h', self.ver)
        buf += struct.pack('>i', self.op)
        buf += struct.pack('>i', self.seq)
        buf += self.body.encode()
        return buf

    def unpack(self, buf):
        if len(buf) < self.headerLen:
            print("包头不够")
            return
        self.packetLen = struct.unpack('>i', buf[0:4])[0]
        self.headerLen = struct.unpack('>h', buf[4:6])[0]
        self.ver = struct.unpack('>h', buf[6:8])[0]
        self.op = struct.unpack('>i', buf[8:12])[0]
        self.seq = struct.unpack('>i', buf[12:16])[0]
        if self.packetLen < 0 or self.packetLen > self.maxBody:
            print("包体长不对", "self.packetLen:", self.packetLen,
                  " self.maxBody:", self.maxBody)
            return
        if self.headerLen != 16:
            print("包头长度不对")
            return
        bodyLen = self.packetLen - self.headerLen
        self.body = buf[16:self.packetLen]
        if bodyLen <= 0:
            return
        if self.op == 3 and bodyLen >= 4:
            popularity = struct.unpack('>I', self.body[:4])[0]
            print("[BiliClient] heartbeat reply:", popularity)
        elif self.ver == 0:
            # 这里做回调
            print("====> callback:", self.body.decode('utf-8'))
        elif self.ver == 2:
            decompressed = zlib.decompress(self.body)
            offset = 0
            while offset + 16 <= len(decompressed):
                nested_len = struct.unpack(
                    '>I', decompressed[offset:offset + 4]
                )[0]
                if nested_len < 16 or offset + nested_len > len(decompressed):
                    print("压缩包内的子包长度不正确")
                    return
                nested = Proto()
                nested.unpack(decompressed[offset:offset + nested_len])
                offset += nested_len
        else:
            return
