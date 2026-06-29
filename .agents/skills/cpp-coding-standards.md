# C++ 编码标准

> 为 `.agents/rules/cpp/` 规则提供深入的可操作参考。

## 现代 C++ (C++17/20/23)

### auto 的使用

```cpp
auto it = map.find(key);          // 类型明显
auto* ptr = dynamic_cast<T*>(b);  // 指针明确
auto [x, y] = point;             // 结构化绑定

// 避免在类型不明显时使用 auto
auto result = compute();  // compute() 返回什么？
```

### constexpr 和 consteval

```cpp
constexpr int factorial(int n) {
    return n <= 1 ? 1 : n * factorial(n - 1);
}

constexpr auto SIZE = 1024;
std::array<int, SIZE> buffer{};
```

### 结构化绑定

```cpp
for (auto&& [key, value] : map) { /* ... */ }
auto [iter, inserted] = set.insert(42);
auto [width, height, depth] = get_dimensions();
```

## 资源管理 (RAII)

### 智能指针规则

```cpp
// 独占所有权 → unique_ptr
class Controller {
    std::unique_ptr<Device> device_;
public:
    Controller() : device_(std::make_unique<Device>()) {}
};

// 共享所有权 → shared_ptr (谨慎使用)
std::shared_ptr<Cache> cache = std::make_shared<Cache>();

// 非所有关系 → raw pointer 或 reference
void process(const Device& device);      // 首选引用
void process(Device* device);            // nullable 时用指针
```

### 禁止事项

- 禁止裸 `new` / `delete`
- 禁止 `malloc` / `free`
- 禁止 `std::auto_ptr`（C++11 已移除）

## 命名约定

| 类别 | 约定 | 示例 |
|------|------|------|
| 类/结构体 | `PascalCase` | `RemoteController`, `DeviceInfo` |
| 函数/方法 | `snake_case` | `connect_device()`, `get_status()` |
| 成员变量 | `snake_case_` | `device_id_`, `is_connected_` |
| 常量 | `kPascalCase` | `kMaxRetries`, `kBufferSize` |
| 命名空间 | `lowercase` | `ms_rcs`, `ms_rcs::detail` |
| 枚举 | `PascalCase` | `enum class State { Idle, Active }` |

## 代码格式化

### clang-format

项目必须配置 `.clang-format` 文件：

```yaml
# .clang-format 关键配置
BasedOnStyle: Google
IndentWidth: 4
ColumnLimit: 120
PointerAlignment: Left
```

```bash
clang-format -i src/*.cpp src/*.hpp
clang-format --dry-run --Werror src/*.cpp  # CI 检查
```

## 类设计

### 零/五法则

```cpp
// 零法则：不声明任何特殊成员
struct Data {
    std::string name;
    std::vector<int> values;
};

// 五法则：声明了析构则声明全部
class Resource {
public:
    Resource() = default;
    ~Resource() { /* cleanup */ }
    Resource(const Resource&) = delete;             // 或默认
    Resource& operator=(const Resource&) = delete;   // 或默认
    Resource(Resource&&) = default;
    Resource& operator=(Resource&&) = default;
};
```

### 值语义

```cpp
void process(std::string_view text);   // 只读参数
void store(std::string text);          // 需要所有权
std::string generate();                 // 返回值（依赖 RVO）

// 移动语义
data.sink(std::move(heavy_object));     // 转移所有权
```

## 错误处理

### 异常

```cpp
void connect(const std::string& addr) {
    if (!validate(addr)) {
        throw std::invalid_argument("Invalid address: " + addr);
    }
    // ... 连接逻辑
}
```

### std::optional

```cpp
std::optional<Device> find_device(const std::string& id) {
    if (auto it = devices_.find(id); it != devices_.end()) {
        return *it;
    }
    return std::nullopt;
}

// 使用
if (auto dev = find_device("sensor-1")) {
    dev->activate();
} else {
    std::cerr << "Device not found\n";
}
```

### std::expected (C++23) / 自定义 Result

```cpp
// C++23
std::expected<int, std::string> parse(const std::string& s) {
    try {
        return std::stoi(s);
    } catch (...) {
        return std::unexpected("Parse failed");
    }
}

// 使用
auto result = parse("42");
if (result) {
    std::cout << *result << '\n';
} else {
    std::cerr << result.error() << '\n';
}
```

## 安全性

### 内存安全

```cpp
// 禁止 C 风格数组
int buffer[256];  // BAD
std::array<int, 256> buffer{};  // GOOD

// 禁止 C 字符串
char* str = strcpy(dest, src);  // BAD
std::string str = src;           // GOOD
std::string_view view = str;     // 只读视图

// 边界检查
vec[i];       // 不检查边界
vec.at(i);    // 检查边界，安全关键场景
vec[i];       // 性能关键场景（已验证索引）
```

### 类型转换

```cpp
// 优先使用 C++ 转换
static_cast<int>(x);                       // 普通转换
dynamic_cast<Derived*>(base);              // 运行时检查
const_cast<char*>(ptr);                    // 极少使用
reinterpret_cast<int*>(&x);               // 尽量避免
```

### 静态分析

```bash
clang-tidy --checks='*' src/*.cpp -- -std=c++17
cppcheck --enable=all src/
```

## 性能

### 移动语义

```cpp
// 容器操作
vec.push_back(std::move(item));          // 转移而非复制
vec.emplace_back(arg1, arg2);            // 原地构造

// 返回时不要 std::move，会破坏 RVO
std::string make() {
    std::string result = "hello";
    return result;           // RVO 自动优化
    // return std::move(result);  // BAD: 阻止 RVO
}
```

### 避免不必要的复制

```cpp
void print(const std::string& str);       // 只读 → const&
void print(std::string_view sv);          // 更灵活
for (const auto& item : container) { }    // 遍历容器
for (auto item : container) { }           // 仅小型可平凡复制类型
```

## 代码检查清单

提交前确认：
- [ ] 无裸 `new` / `delete`
- [ ] 使用智能指针管理资源
- [ ] 类遵循零法则或五法则
- [ ] 命名符合项目约定
- [ ] 运行 `clang-format` 格式化
- [ ] 运行 `clang-tidy` 静态分析
- [ ] 编译器警告全部处理 (`-Wall -Wextra`)

## 参考

- [C++ Core Guidelines](https://isocpp.github.io/CppCoreGuidelines/)
- [Google C++ Style Guide](https://google.github.io/styleguide/cppguide.html)
- 相关规则：`.agents/rules/cpp/coding-style.md`
- 相关规则：`.agents/rules/cpp/patterns.md`
- 相关规则：`.agents/rules/cpp/security.md`
