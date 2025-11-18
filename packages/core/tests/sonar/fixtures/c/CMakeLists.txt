cmake_minimum_required(VERSION 3.10)
project(test_c_project C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

include_directories(include)

add_executable(test_app
    src/main.c
    src/utils.c
)
