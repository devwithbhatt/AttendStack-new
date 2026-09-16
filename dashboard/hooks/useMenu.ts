//import custom hooks
import { useCallback } from "react";
import { useAppDispatch, useAppSelector } from "store/store";

//import redux slices
import {
  toggleMenu,
  setCollapsed,
  MenuToggleType,
} from "store/slices/appSlice";

const useMenu = () => {
  const showMenu = useAppSelector((state) => state.app.showMenu);

  const dispatch = useAppDispatch();

  const toggleMenuHandler = useCallback((value: boolean) => {
    dispatch(toggleMenu({ showMenu: value }));
  }, [dispatch]);

  const handleCollapsed = useCallback((value: MenuToggleType) => {
    dispatch(setCollapsed({ value: value }));
  }, [dispatch]);

  return { toggleMenuHandler, showMenu, handleCollapsed };
};

export default useMenu;
