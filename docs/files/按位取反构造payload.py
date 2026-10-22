def qvfan(s) :
    return ''.join('%%%02X' % (255 - ord(c)) for c in s)
print(qvfan("$_GET['_']"))
print(qvfan("$_GET['__']"))