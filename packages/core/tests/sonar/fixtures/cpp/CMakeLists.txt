cmake_minimum_required(VERSION 3.10)
project(test_cpp_project CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

include_directories(include)

add_executable(test_app
    src/main.cpp
    src/calculator.cpp
)
