fn fibonacci(n: u64) -> u64 {
    if n <= 0 {
        return 0;
    }
    if n == 1 {
        return 1;
    }
    let (mut a, mut b) = (0u64, 1u64);
    for _ in 2..=n {
        let temp = b;
        b = a + b;
        a = temp;
    }
    b
}

fn greet(name: &str) -> String {
    if name.is_empty() {
        return String::from("Hello, World!");
    }
    format!("Hello, {}!", name)
}
