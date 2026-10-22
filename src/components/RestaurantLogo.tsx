export function RestaurantLogo({ large = false }: { large?: boolean }) {
  return <img src="/sea-slash-logo.svg" alt="Sea Slash" width={large ? 288 : 112} height={large ? 180 : 70} className={`${large ? 'mx-auto w-72 max-w-full' : 'w-20 sm:w-28 shrink-0'} h-auto aspect-[8/5] rounded-md bg-white object-cover`} />;
}
