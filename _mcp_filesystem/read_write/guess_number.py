import random


def guess_the_number():
    """Simple text-based 'Guess the Number' game."""
    target = random.randint(1, 100)
    attempts = 7
    guessed = False

    print("I'm thinking of a number between 1 and 100. You have 7 attempts to guess it.")

    while attempts > 0 and not guessed:
        try:
            guess = int(input(f"Enter your guess (attempts left: {attempts}): "))
            attempts -= 1

            if guess == target:
                print(f"🎉 Congratulations! You guessed the number {target} correctly!")
                guessed = True
            elif guess < target:
                print("Too low! Try again.")
            else:
                print("Too high! Try again.")

        except ValueError:
            print("Please enter a valid integer.")
            attempts += 1  # No penalty for invalid input

    if not guessed:
        print(f"❌ Game over! The number was {target}.")


# Run the game
if __name__ == "__main__":
    guess_the_number()