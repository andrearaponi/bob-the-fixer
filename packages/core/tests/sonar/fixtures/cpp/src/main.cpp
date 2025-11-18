#include <iostream>
#include "calculator.hpp"

int main() {
    Calculator calc;
    std::cout << "5 + 3 = " << calc.add(5, 3) << std::endl;
    return 0;
}
