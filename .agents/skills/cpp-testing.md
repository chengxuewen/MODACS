# C++ 测试

> 为 `.agents/rules/cpp/testing.md` 规则提供深入的可操作参考。

## 框架

使用 **GoogleTest (gtest/gmock)** 配合 **CMake/CTest**。

### CMakeLists.txt 配置

```cmake
enable_testing()
find_package(GTest REQUIRED)

add_executable(tests
    tests/main.cpp
    tests/device_test.cpp
    tests/controller_test.cpp
)
target_link_libraries(tests PRIVATE GTest::gtest GTest::gmock_main)
include(GoogleTest)
gtest_discover_tests(tests)
```

### 测试入口

```cpp
// tests/main.cpp
#include <gtest/gtest.h>

int main(int argc, char** argv) {
    ::testing::InitGoogleTest(&argc, argv);
    return RUN_ALL_TESTS();
}
```

## TDD 工作流

1. **RED**: 编写测试，运行确认失败
2. **GREEN**: 编写最小实现，运行确认通过
3. **REFACTOR**: 优化代码结构，保持测试通过

```bash
cmake --build build && ctest --test-dir build --output-on-failure
```

## 单元测试模式

### AAA 模式 (Arrange-Act-Assert)

```cpp
TEST(DeviceTest, ConnectSucceedsWithValidAddress) {
    // Arrange
    Device device;
    auto addr = "192.168.1.1:8080";

    // Act
    auto result = device.connect(addr);

    // Assert
    ASSERT_TRUE(result);
    EXPECT_EQ(device.state(), State::Connected);
}
```

### 测试命名

```
TEST(<Fixture>, <Description>)  // 描述被测行为
TEST(DeviceTest, ReturnsFalseWhenAddressIsInvalid)
TEST(ControllerTest, SendsPeriodicHeartbeatWhenConnected)
TEST(ParserTest, ThrowsOnMalformedInput)
```

### 断言选择

```cpp
// ASSERT_*: 失败后终止当前测试（用于前提条件）
ASSERT_TRUE(ptr != nullptr);
ASSERT_NE(find_device(), std::nullopt);

// EXPECT_*: 失败后继续（用于多个检查点）
EXPECT_EQ(result.code, 200);
EXPECT_STREQ(result.msg.c_str(), "OK");
EXPECT_THROW(parse("bad"), std::exception);
```

## Mock 对象 (GMock)

### 定义 Mock 接口

```cpp
class MockDevice : public IDevice {
public:
    MOCK_METHOD(bool, connect, (const std::string& addr), (override));
    MOCK_METHOD(void, disconnect, (), (override));
    MOCK_METHOD(std::string, get_status, (), (const, override));
};
```

### 设置期待

```cpp
TEST(ControllerTest, RetriesOnConnectionFailure) {
    MockDevice mock;
    Controller controller(&mock);

    EXPECT_CALL(mock, connect(_))
        .Times(3)
        .WillOnce(Return(false))
        .WillOnce(Return(false))
        .WillOnce(Return(true));

    EXPECT_CALL(mock, disconnect()).Times(0);

    controller.initialize("192.168.1.1");
    EXPECT_TRUE(controller.is_ready());
}
```

### GMock 匹配器

```cpp
EXPECT_CALL(mock, process(Eq("expected_str")));
EXPECT_CALL(mock, process(HasSubstr("key")));
EXPECT_CALL(mock, process(AllOf(Ge(0), Le(100))));
EXPECT_CALL(mock, process(_));  // 任意参数
```

## 测试夹具

```cpp
class DeviceTest : public ::testing::Test {
protected:
    void SetUp() override {
        // 每个 TEST_F 前执行
        device_ = std::make_unique<Device>();
    }

    void TearDown() override {
        // 每个 TEST_F 后执行
        device_->disconnect();
    }

    std::unique_ptr<Device> device_;
};

TEST_F(DeviceTest, StartsInDisconnectedState) {
    EXPECT_EQ(device_->state(), State::Disconnected);
}
```

## 参数化测试

```cpp
class ParserTest : public ::testing::TestWithParam<std::pair<std::string, int>> {};

TEST_P(ParserTest, ParsesCorrectly) {
    auto [input, expected] = GetParam();
    EXPECT_EQ(parse(input), expected);
}

INSTANTIATE_TEST_SUITE_P(
    ValidInputs, ParserTest,
    ::testing::Values(
        std::pair{"0", 0},
        std::pair{"42", 42},
        std::pair{"-1", -1}
    ));
```

## 死亡测试

```cpp
TEST(AssertTest, CrashesOnNullptr) {
    ASSERT_DEATH(dereference(nullptr), "");
}
```

## 覆盖率

```bash
# 编译插桩
cmake -DCMAKE_CXX_FLAGS="--coverage" -DCMAKE_EXE_LINKER_FLAGS="--coverage" ..

# 构建并运行测试
cmake --build .
ctest --output-on-failure

# 生成覆盖率报告
lcov --capture --directory . --output-file coverage.info
lcov --remove coverage.info '/usr/*' '*/tests/*' -o coverage_filtered.info
genhtml coverage_filtered.info --output-directory coverage_report
```

**目标**: 行覆盖 ≥ 80%

## Sanitizer 集成

```bash
# Address Sanitizer + Undefined Behavior Sanitizer
cmake -DCMAKE_CXX_FLAGS="-fsanitize=address,undefined -fno-omit-frame-pointer" ..
cmake --build . && ctest --output-on-failure

# Thread Sanitizer（单独运行）
cmake -DCMAKE_CXX_FLAGS="-fsanitize=thread" ..
cmake --build . && ctest --output-on-failure

# Memory Sanitizer（需要 Clang）
cmake -DCMAKE_CXX_FLAGS="-fsanitize=memory" ..
```

## CI 管道

```yaml
# 推荐 CI 步骤
steps:
  - name: Format Check
    run: clang-format --dry-run --Werror src/*.cpp src/*.hpp
  - name: Static Analysis
    run: clang-tidy src/*.cpp -- -std=c++17
  - name: Build
    run: cmake --build build
  - name: Unit Tests
    run: ctest --test-dir build --output-on-failure
  - name: Sanitizer Tests
    run: ctest --test-dir build_sanitized --output-on-failure
  - name: Coverage
    run: lcov ...
```

## 检查清单

- [ ] 所有新功能有对应测试
- [ ] 测试覆盖 happy path 和 error path
- [ ] 一个测试只验证一个行为
- [ ] 测试间相互独立（不含依赖顺序）
- [ ] 外部依赖已 mock
- [ ] 行覆盖 ≥ 80%
- [ ] Sanitizer 构建无报错

## 参考

- [GoogleTest User Guide](https://google.github.io/googletest/)
- [GoogleMock Cheat Sheet](https://google.github.io/googletest/gmock_cheat_sheet.html)
- 相关规则：`.agents/rules/cpp/testing.md`
- 相关规则：`.agents/rules/cpp/hooks.md`
