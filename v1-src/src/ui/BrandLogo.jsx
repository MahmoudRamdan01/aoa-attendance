import { cls } from "../lib/cls";

function BrandLogo({ large }) {
  return (
    <div className={cls("brand-mark", large && "large")}>
      <img src="./logo.png" alt="Air Ocean Line" />
    </div>
  );
}

export default BrandLogo;
